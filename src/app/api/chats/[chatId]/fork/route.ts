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
    const forkAtMessageId: string | undefined = body.messageId;
    if (!forkAtMessageId) {
        return NextResponse.json({ error: "messageId required" }, { status: 400 });
    }

    const chat = await prisma.chat.findFirst({
        where: { id: chatId, deletedAt: null },
        select: { userId: true, title: true },
    });
    if (!chat || (chat.userId !== session.user.id && session.user.role !== "ADMIN")) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get all messages ordered by creation time
    const allMessages = await prisma.message.findMany({
        where: { chatId },
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, content: true },
    });

    // Find the fork point (inclusive)
    const forkIdx = allMessages.findIndex((m) => m.id === forkAtMessageId);
    if (forkIdx === -1) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    const messagesToCopy = allMessages.slice(0, forkIdx + 1);

    // Create the new chat with a forked title
    const newTitle = `[Fork] ${chat.title}`.slice(0, 60);
    const newChat = await prisma.chat.create({
        data: {
            userId: session.user.id,
            title: newTitle,
            parentChatId: chatId,
            forkMessageId: forkAtMessageId,
        },
    });

    // Copy messages into the new chat preserving order via sequential insert
    for (const msg of messagesToCopy) {
        await prisma.message.create({
            data: {
                chatId: newChat.id,
                role: msg.role,
                content: msg.content,
            },
        });
    }

    return NextResponse.json({ chatId: newChat.id, title: newTitle });
}
