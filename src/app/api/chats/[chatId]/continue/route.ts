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
    const count: number = Math.max(1, Math.min(200, Number(body.count) || 10));

    const chat = await prisma.chat.findFirst({
        where: { id: chatId, deletedAt: null },
        select: { userId: true, title: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!chat || (chat.userId !== session.user.id && (session.user as any).role !== "ADMIN")) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const allMessages = await prisma.message.findMany({
        where: { chatId },
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, content: true },
    });

    const messagesToCopy = count >= allMessages.length
        ? allMessages
        : allMessages.slice(-count);

    const newTitle = `[Continue] ${chat.title}`.slice(0, 60);
    const newChat = await prisma.chat.create({
        data: {
            userId: session.user.id,
            title: newTitle,
            parentChatId: chatId,
            forkMessageId: messagesToCopy[0]?.id ?? null,
        },
    });

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
