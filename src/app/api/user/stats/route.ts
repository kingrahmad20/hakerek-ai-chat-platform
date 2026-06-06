import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    const [totalChats, totalMessages, tokenAgg] = await Promise.all([
        prisma.chat.count({ where: { userId } }),
        prisma.message.count({ where: { chat: { userId }, role: "user" } }),
        prisma.usageLog.aggregate({ where: { userId }, _sum: { inputTokens: true, outputTokens: true } }),
    ]);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const recentMessages = await prisma.message.findMany({
        where: { chat: { userId }, role: "user", createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true },
    });

    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        d.setHours(0, 0, 0, 0);
        const next = new Date(d); next.setDate(next.getDate() + 1);
        return {
            date: d.toISOString().slice(0, 10),
            label: d.toLocaleDateString("id-ID", { weekday: "short" }),
            messages: recentMessages.filter(m => {
                const t = new Date(m.createdAt).getTime();
                return t >= d.getTime() && t < next.getTime();
            }).length,
        };
    });

    const topModels = await prisma.usageLog.groupBy({
        by: ["model"],
        where: { userId },
        _count: { model: true },
        _sum: { inputTokens: true, outputTokens: true },
        orderBy: { _count: { model: "desc" } },
        take: 3,
    });

    return NextResponse.json({
        totalChats,
        totalMessages,
        totalInputTokens: tokenAgg._sum.inputTokens ?? 0,
        totalOutputTokens: tokenAgg._sum.outputTokens ?? 0,
        last7Days,
        topModels: topModels.map(m => ({
            model: m.model,
            count: m._count.model,
            tokens: (m._sum.inputTokens ?? 0) + (m._sum.outputTokens ?? 0),
        })),
    });
}
