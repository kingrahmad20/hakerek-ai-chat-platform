import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["thumbs_up", "thumbs_down", "❤️", "😂", "🎉", "🤔"]);

export async function POST(
    req: Request,
    { params }: { params: Promise<{ messageId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { messageId } = await params;
    const userId = session.user.id;
    const body = await req.json();
    const type: string = body?.type?.trim();

    if (!type || !ALLOWED_TYPES.has(type)) {
        return NextResponse.json({ error: "Invalid reaction type" }, { status: 400 });
    }

    const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, chatId: true, role: true, chat: { select: { userId: true, workspaceFolderId: true } } },
    });
    if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Only allow reacting to assistant messages
    if (message.role !== "assistant") {
        return NextResponse.json({ error: "Can only react to assistant messages" }, { status: 400 });
    }

    // Verify the user can access this chat
    const chat = message.chat;
    const isAdmin = session.user.role === "ADMIN";
    const isOwner = chat.userId === userId;
    if (!isOwner && !isAdmin) {
        if (!chat.workspaceFolderId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const folder = await prisma.workspaceFolder.findUnique({
            where: { id: chat.workspaceFolderId },
            select: { workspaceId: true },
        });
        if (!folder) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        const member = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId: folder.workspaceId, userId } },
        });
        if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.messageReaction.findUnique({
        where: { messageId_userId_type: { messageId, userId, type } },
    });

    if (existing) {
        await prisma.messageReaction.delete({ where: { id: existing.id } });
        return NextResponse.json({ active: false });
    }

    // Thumbs up/down are mutually exclusive
    if (type === "thumbs_up") {
        await prisma.messageReaction.deleteMany({ where: { messageId, userId, type: "thumbs_down" } });
    } else if (type === "thumbs_down") {
        await prisma.messageReaction.deleteMany({ where: { messageId, userId, type: "thumbs_up" } });
    }

    await prisma.messageReaction.create({ data: { messageId, userId, type } });
    return NextResponse.json({ active: true });
}
