import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// GET /api/user/usage?range=30 — token/cost analytics for the signed-in user.
export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    const range = Math.min(90, Math.max(7, parseInt(request.nextUrl.searchParams.get("range") ?? "30")));

    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - range);
    const monthStart = new Date(now);
    monthStart.setDate(monthStart.getDate() - 30);

    const [user, totalAgg, monthAgg, modelRows, rangeLogs] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { monthlyTokenQuota: true } }),
        prisma.usageLog.aggregate({
            where: { userId },
            _sum: { inputTokens: true, outputTokens: true },
            _count: { id: true },
        }),
        prisma.usageLog.aggregate({
            where: { userId, createdAt: { gte: monthStart } },
            _sum: { inputTokens: true, outputTokens: true },
        }),
        prisma.usageLog.groupBy({
            by: ["model"],
            where: { userId },
            _sum: { inputTokens: true, outputTokens: true },
            _count: { id: true },
            orderBy: { _sum: { inputTokens: "desc" } },
        }),
        prisma.usageLog.findMany({
            where: { userId, createdAt: { gte: rangeStart } },
            select: { createdAt: true, inputTokens: true, outputTokens: true, model: true },
        }),
    ]);

    const totalInputTokens = totalAgg._sum.inputTokens ?? 0;
    const totalOutputTokens = totalAgg._sum.outputTokens ?? 0;

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
    const totalEstimatedCostUsd = byModel.reduce((s, r) => s + r.estimatedCostUsd, 0);

    // Last-30-day window for quota tracking and a rolling cost estimate.
    const monthTokens = (monthAgg._sum.inputTokens ?? 0) + (monthAgg._sum.outputTokens ?? 0);

    // Daily token + cost trend across the selected range.
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
        totalRequests: totalAgg._count.id,
        totalInputTokens,
        totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        totalEstimatedCostUsd,
        monthlyTokenQuota: user?.monthlyTokenQuota ?? null,
        monthTokensUsed: monthTokens,
        byModel,
        dailyStats,
    });
}
