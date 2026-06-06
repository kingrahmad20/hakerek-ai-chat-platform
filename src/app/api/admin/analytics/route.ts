import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role;
    if (!role || (role !== "ADMIN" && role !== "billing_admin")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const range = Math.min(90, Math.max(7, parseInt(request.nextUrl.searchParams.get("range") ?? "30")));

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - range);

    // Per-model aggregates (all time)
    const modelRows = await prisma.usageLog.groupBy({
        by: ["model"],
        _sum: { inputTokens: true, outputTokens: true },
        _count: { id: true },
        orderBy: { _sum: { inputTokens: "desc" } },
    });

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

    const totalEstimatedCost = byModel.reduce((s, r) => s + r.estimatedCostUsd, 0);

    // Daily stats for the selected range
    const dailyLogs = await prisma.usageLog.findMany({
        where: { createdAt: { gte: rangeStart } },
        select: { userId: true, createdAt: true, inputTokens: true, outputTokens: true, model: true },
    });

    const dailyMap: Record<string, { activeUsers: Set<string>; requests: number; tokens: number; cost: number }> = {};
    for (let i = range - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dailyMap[key] = { activeUsers: new Set(), requests: 0, tokens: 0, cost: 0 };
    }
    for (const log of dailyLogs) {
        const key = log.createdAt.toISOString().slice(0, 10);
        if (!dailyMap[key]) continue;
        if (log.userId) dailyMap[key].activeUsers.add(log.userId);
        dailyMap[key].requests++;
        dailyMap[key].tokens += (log.inputTokens ?? 0) + (log.outputTokens ?? 0);
        dailyMap[key].cost += estimateCostUsd(log.model, log.inputTokens ?? 0, log.outputTokens ?? 0);
    }
    const dailyStats = Object.entries(dailyMap).map(([date, v]) => ({
        date,
        activeUsers: v.activeUsers.size,
        requests: v.requests,
        tokens: v.tokens,
        cost: parseFloat(v.cost.toFixed(6)),
    }));

    // Active users last 30 days
    const activeUsersLast30 = await prisma.usageLog.findMany({
        where: { createdAt: { gte: thirtyDaysAgo }, userId: { not: null } },
        select: { userId: true },
        distinct: ["userId"],
    });

    // Monthly cost estimate (last 30 days)
    const last30CostLogs = await prisma.usageLog.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { model: true, inputTokens: true, outputTokens: true },
    });
    const monthlyEstimateUsd = last30CostLogs.reduce(
        (s, l) => s + estimateCostUsd(l.model, l.inputTokens ?? 0, l.outputTokens ?? 0),
        0
    );

    // Top 10 users by total token usage (all time), fetch top 20 by inputTokens then sort in JS
    const topUserRows = await prisma.usageLog.groupBy({
        by: ["userId"],
        where: { userId: { not: null } },
        _sum: { inputTokens: true, outputTokens: true },
        _count: { id: true },
        orderBy: { _sum: { inputTokens: "desc" } },
        take: 20,
    });

    const userIds = topUserRows.map((r) => r.userId).filter(Boolean) as string[];
    const usersData = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
    });
    const userMap = Object.fromEntries(usersData.map((u) => [u.id, u]));

    const topUsers = topUserRows
        .map((row) => {
            const u = userMap[row.userId!];
            const input = row._sum.inputTokens ?? 0;
            const output = row._sum.outputTokens ?? 0;
            return {
                userId: row.userId,
                name: u?.name || u?.email?.split("@")[0] || "Unknown",
                requests: row._count.id,
                totalTokens: input + output,
            };
        })
        .sort((a, b) => b.totalTokens - a.totalTokens)
        .slice(0, 10);

    return NextResponse.json({
        byModel,
        totalEstimatedCostUsd: totalEstimatedCost,
        monthlyEstimateUsd,
        activeUsersLast30: activeUsersLast30.length,
        dailyStats,
        topUsers,
        range,
    });
}
