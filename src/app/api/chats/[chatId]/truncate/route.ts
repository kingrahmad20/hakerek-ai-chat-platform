import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ chatId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chatId } = await params;
    const body = await req.json();
    const keepCount: number = body.keepCount ?? 0;

    const chat = await prisma.chat.findFirst({ where: { id: chatId, deletedAt: null }, select: { userId: true } });
    if (!chat || (chat.userId !== session.user.id && session.user.role !== "ADMIN")) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get all messages ordered by creation time, keep only the first `keepCount`
    const all = await prisma.message.findMany({
        where: { chatId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
    });

    const toDelete = all.slice(keepCount).map((m) => m.id);
    if (toDelete.length > 0) {
        await prisma.message.deleteMany({ where: { id: { in: toDelete } } });
    }

    return NextResponse.json({ ok: true, deleted: toDelete.length });
}
