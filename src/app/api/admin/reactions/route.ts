import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role;
    if (!role || (role !== "ADMIN" && role !== "billing_admin" && role !== "content_moderator")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const range = Math.min(90, Math.max(7, parseInt(request.nextUrl.searchParams.get("range") ?? "30")));
    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - range);

    const [thumbsUp, thumbsDown, emojiCounts, lowQualityMessages, dailyRaw, modelQualityRaw] = await Promise.all([
        prisma.messageReaction.count({ where: { type: "thumbs_up", createdAt: { gte: rangeStart } } }),
        prisma.messageReaction.count({ where: { type: "thumbs_down", createdAt: { gte: rangeStart } } }),
        prisma.messageReaction.groupBy({
            by: ["type"],
            where: { type: { notIn: ["thumbs_up", "thumbs_down"] }, createdAt: { gte: rangeStart } },
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
        }),
        // Messages with the most thumbs_down reactions
        prisma.messageReaction.groupBy({
            by: ["messageId"],
            where: { type: "thumbs_down" },
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
            take: 10,
        }),
        prisma.$queryRaw<Array<{ date: Date; thumbsUp: bigint; thumbsDown: bigint }>>`
            SELECT
                "createdAt"::date AS date,
                SUM(CASE WHEN type = 'thumbs_up'   THEN 1 ELSE 0 END)::int AS "thumbsUp",
                SUM(CASE WHEN type = 'thumbs_down' THEN 1 ELSE 0 END)::int AS "thumbsDown"
            FROM "MessageReaction"
            WHERE "createdAt" >= ${rangeStart}
            GROUP BY "createdAt"::date
            ORDER BY date ASC
        `,
        prisma.$queryRaw<Array<{ model: string; thumbsUp: bigint; thumbsDown: bigint }>>`
            SELECT
                m.model,
                SUM(CASE WHEN mr.type = 'thumbs_up'   THEN 1 ELSE 0 END)::int AS "thumbsUp",
                SUM(CASE WHEN mr.type = 'thumbs_down' THEN 1 ELSE 0 END)::int AS "thumbsDown"
            FROM "MessageReaction" mr
            JOIN "Message" m ON mr."messageId" = m.id
            WHERE mr.type IN ('thumbs_up', 'thumbs_down')
              AND m.model IS NOT NULL
              AND mr."createdAt" >= ${rangeStart}
            GROUP BY m.model
            ORDER BY (SUM(CASE WHEN mr.type = 'thumbs_up' THEN 1 ELSE 0 END) + SUM(CASE WHEN mr.type = 'thumbs_down' THEN 1 ELSE 0 END)) DESC
        `,
    ]);

    // Fetch message content for low-quality messages
    const lowQualityIds = lowQualityMessages.map((r) => r.messageId);
    const lowQualityDetails = lowQualityIds.length
        ? await prisma.message.findMany({
            where: { id: { in: lowQualityIds } },
            select: {
                id: true,
                content: true,
                chatId: true,
                createdAt: true,
                chat: { select: { title: true, userId: true, user: { select: { name: true, email: true } } } },
                reactions: {
                    select: { type: true },
                },
            },
        })
        : [];

    const lowQuality = lowQualityMessages.map((r) => {
        const msg = lowQualityDetails.find((m) => m.id === r.messageId);
        if (!msg) return null;
        let preview = msg.content;
        try {
            const parsed = JSON.parse(msg.content);
            if (parsed?.text) preview = parsed.text;
        } catch {}
        const thumbsUpCount = msg.reactions.filter((rx) => rx.type === "thumbs_up").length;
        return {
            messageId: r.messageId,
            chatId: msg.chatId,
            chatTitle: msg.chat?.title ?? "Unknown",
            userEmail: msg.chat?.user?.email ?? null,
            userName: msg.chat?.user?.name ?? null,
            preview: preview.slice(0, 200),
            thumbsDown: r._count.id,
            thumbsUp: thumbsUpCount,
            createdAt: msg.createdAt,
        };
    }).filter(Boolean);

    const dailyReactions = dailyRaw.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        thumbsUp: Number(r.thumbsUp),
        thumbsDown: Number(r.thumbsDown),
    }));

    const modelQuality = modelQualityRaw.map((r) => ({
        model: r.model,
        thumbsUp: Number(r.thumbsUp),
        thumbsDown: Number(r.thumbsDown),
        total: Number(r.thumbsUp) + Number(r.thumbsDown),
        approvalRate: Number(r.thumbsUp) + Number(r.thumbsDown) > 0
            ? Math.round((Number(r.thumbsUp) / (Number(r.thumbsUp) + Number(r.thumbsDown))) * 100)
            : null,
    }));

    return NextResponse.json({
        thumbsUp,
        thumbsDown,
        emojiCounts: emojiCounts.map((e) => ({ type: e.type, count: e._count.id })),
        dailyReactions,
        lowQuality,
        modelQuality,
        range,
    });
}
