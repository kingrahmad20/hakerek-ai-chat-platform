import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;
    const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);

    // Auto-purge chats that have been in trash for more than 30 days
    const expired = await prisma.chat.findMany({
        where: { userId, deletedAt: { not: null, lt: cutoff } },
        select: { id: true },
    });
    if (expired.length > 0) {
        const ids = expired.map((c) => c.id);
        await prisma.message.deleteMany({ where: { chatId: { in: ids } } });
        await prisma.chat.deleteMany({ where: { id: { in: ids } } });
    }

    const chats = await prisma.chat.findMany({
        where: { userId, deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
        select: {
            id: true,
            title: true,
            deletedAt: true,
            _count: { select: { messages: true } },
        },
    });

    return NextResponse.json(chats);
}
