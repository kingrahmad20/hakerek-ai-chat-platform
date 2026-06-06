import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/pricing";
import { getWorkspaceMonthSpendUsd } from "@/lib/budget";

export const dynamic = "force-dynamic";

// GET /api/workspaces/[workspaceId]/usage?range=30 — token/cost analytics for a
// whole workspace. OWNER/ADMIN only. Usage is attributed to a workspace through
// its chats: UsageLog.chatId → Chat.workspaceFolderId → WorkspaceFolder.workspaceId.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ workspaceId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId } = await params;
    const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    });
    if (!member || (member.role !== "OWNER" && member.role !== "ADMIN")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const range = Math.min(90, Math.max(7, parseInt(request.nextUrl.searchParams.get("range") ?? "30")));
    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - range);

    // Budget guardrail status is always reported on a calendar-month basis,
    // independent of the selected analytics range.
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { monthlyBudgetUsd: true },
    });
    const monthlyBudgetUsd = ws?.monthlyBudgetUsd ?? null;
    const currentMonthSpendUsd = await getWorkspaceMonthSpendUsd(workspaceId, now);
    const budget = { monthlyBudgetUsd, currentMonthSpendUsd };

    // Chats that belong to this workspace (via its shared folders), with their owner.
    const chats = await prisma.chat.findMany({
        where: { workspaceFolder: { workspaceId } },
        select: { id: true, userId: true },
    });
    const chatIds = chats.map((c) => c.id);

    const empty = {
        range,
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalEstimatedCostUsd: 0,
        byModel: [] as unknown[],
        byMember: [] as unknown[],
        dailyStats: [] as { date: string; tokens: number; cost: number; requests: number }[],
        ...budget,
    };
    if (chatIds.length === 0) {
        // Still emit zero-filled daily buckets so the chart renders an empty axis.
        for (let i = range - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            empty.dailyStats.push({ date: d.toISOString().slice(0, 10), tokens: 0, cost: 0, requests: 0 });
        }
        return NextResponse.json(empty);
    }

    const [modelRows, memberRows, rangeLogs] = await Promise.all([
        prisma.usageLog.groupBy({
            by: ["model"],
            where: { chatId: { in: chatIds } },
            _sum: { inputTokens: true, outputTokens: true },
            _count: { id: true },
            orderBy: { _sum: { inputTokens: "desc" } },
        }),
        prisma.usageLog.groupBy({
            by: ["userId"],
            where: { chatId: { in: chatIds }, userId: { not: null } },
            _sum: { inputTokens: true, outputTokens: true },
            _count: { id: true },
        }),
        prisma.usageLog.findMany({
            where: { chatId: { in: chatIds }, createdAt: { gte: rangeStart } },
            select: { createdAt: true, inputTokens: true, outputTokens: true, model: true },
        }),
    ]);

    const byModel = modelRows.map((row) => {
        const input = row._sum.inputTokens ?? 0;
        const output = row._sum.outputTokens ?? 0;
        return {
            model: row.model,
            requests: row._count.id,
            inputTokens: input,
            outputTokens: output,
            totalTokens: input + output,
            estimatedCostUsd: estimateCostUsd(row.model, input, output),
        };
    });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalRequests = 0;
    let totalEstimatedCostUsd = 0;
    for (const m of byModel) {
        totalInputTokens += m.inputTokens;
        totalOutputTokens += m.outputTokens;
        totalRequests += m.requests;
        totalEstimatedCostUsd += m.estimatedCostUsd;
    }

    // Resolve member names. Aggregate cost per member needs per-model detail, which
    // groupBy(userId) loses, so approximate member cost via the workspace blended
    // rate (totalCost / totalTokens) applied to each member's token total.
    const userIds = memberRows.map((r) => r.userId).filter(Boolean) as string[];
    const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const totalTokens = totalInputTokens + totalOutputTokens;
    const blendedRate = totalTokens > 0 ? totalEstimatedCostUsd / totalTokens : 0;

    const byMember = memberRows
        .map((row) => {
            const u = userMap[row.userId!];
            const input = row._sum.inputTokens ?? 0;
            const output = row._sum.outputTokens ?? 0;
            const tokens = input + output;
            return {
                userId: row.userId,
                name: u?.name || u?.email?.split("@")[0] || "Unknown",
                requests: row._count.id,
                totalTokens: tokens,
                estimatedCostUsd: tokens * blendedRate,
            };
        })
        .sort((a, b) => b.totalTokens - a.totalTokens);

    const dailyMap: Record<string, { tokens: number; cost: number; requests: number }> = {};
    for (let i = range - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dailyMap[d.toISOString().slice(0, 10)] = { tokens: 0, cost: 0, requests: 0 };
    }
    for (const log of rangeLogs) {
        const key = log.createdAt.toISOString().slice(0, 10);
        const bucket = dailyMap[key];
        if (!bucket) continue;
        bucket.tokens += (log.inputTokens ?? 0) + (log.outputTokens ?? 0);
        bucket.cost += estimateCostUsd(log.model, log.inputTokens ?? 0, log.outputTokens ?? 0);
        bucket.requests++;
    }
    const dailyStats = Object.entries(dailyMap).map(([date, v]) => ({
        date,
        tokens: v.tokens,
        cost: parseFloat(v.cost.toFixed(6)),
        requests: v.requests,
    }));

    return NextResponse.json({
        range,
        totalRequests,
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
        totalEstimatedCostUsd,
        byModel,
        byMember,
        dailyStats,
        ...budget,
    });
}
