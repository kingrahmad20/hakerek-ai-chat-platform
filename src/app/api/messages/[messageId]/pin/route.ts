import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
    _req: Request,
    { params }: { params: Promise<{ messageId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { messageId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { pinned: true, chat: { select: { userId: true, workspaceFolderId: true } } },
    });

    if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const chat = message.chat;
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

    const updated = await prisma.message.update({
        where: { id: messageId },
        data: { pinned: !message.pinned },
        select: { pinned: true },
    });

    return NextResponse.json({ pinned: updated.pinned });
}
