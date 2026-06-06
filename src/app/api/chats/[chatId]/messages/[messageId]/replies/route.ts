import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function canAccess(chatId: string, userId: string, isAdmin: boolean): Promise<boolean> {
    const chat = await prisma.chat.findFirst({
        where: { id: chatId, deletedAt: null },
        select: { userId: true, workspaceFolderId: true },
    });
    if (!chat) return false;
    if (chat.userId === userId || isAdmin) return true;
    if (!chat.workspaceFolderId) return false;
    const folder = await prisma.workspaceFolder.findUnique({
        where: { id: chat.workspaceFolderId },
        select: { workspaceId: true },
    });
    if (!folder) return false;
    const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: folder.workspaceId, userId } },
    });
    return !!member;
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ chatId: string; messageId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chatId, messageId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    const allowed = await canAccess(chatId, userId, isAdmin);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [parentMessage, replies] = await Promise.all([
        prisma.message.findUnique({ where: { id: messageId } }),
        prisma.message.findMany({
            where: { chatId, parentMessageId: messageId },
            orderBy: { createdAt: "asc" },
        }),
    ]);

    if (!parentMessage) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ parent: parentMessage, replies });
}
