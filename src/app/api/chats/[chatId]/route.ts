import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dispatchWebhook } from "@/lib/webhook";
import { canAccessChat as canAccess, canModifyChat as canModify, getChatParticipants } from "@/lib/chat-access";

export const dynamic = "force-dynamic";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ chatId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chatId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    const chat = await prisma.chat.findFirst({
        where: { id: chatId, deletedAt: null },
        include: {
            messages: {
                where: { parentMessageId: null },
                orderBy: { createdAt: "asc" },
                include: {
                    _count: { select: { replies: true } },
                    reactions: { select: { type: true, userId: true } },
                    author: { select: { id: true, name: true, image: true } },
                },
            },
            user: { select: { id: true, email: true, name: true, image: true } },
        },
    });

    if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!(await canAccess(chatId, userId, isAdmin))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isCollaborative = !!chat.workspaceFolderId;
    const participants = isCollaborative ? await getChatParticipants(chatId) : [];

    const messagesWithReactions = chat.messages.map((m) => {
        const reactionMap: Record<string, { count: number; userReacted: boolean }> = {};
        for (const r of m.reactions) {
            if (!reactionMap[r.type]) reactionMap[r.type] = { count: 0, userReacted: false };
            reactionMap[r.type].count++;
            if (r.userId === userId) reactionMap[r.type].userReacted = true;
        }
        const { reactions: _reactions, author, ...rest } = m;
        // Attribute the message: explicit author, else fall back to the chat owner.
        const authorName = author?.name ?? chat.user.name ?? null;
        const authorImage = author?.image ?? chat.user.image ?? null;
        return {
            ...rest,
            authorName,
            authorImage,
            reactions: Object.entries(reactionMap).map(([type, data]) => ({ type, ...data })),
        };
    });

    return NextResponse.json({
        ...chat,
        ownerId: chat.userId,
        isCollaborative,
        participants,
        messages: messagesWithReactions,
    });
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ chatId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chatId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    // Any workspace member may rename/archive workspace chats
    const allowed = await canAccess(chatId, userId, isAdmin);
    if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const data: Record<string, string | boolean | null> = {};
    if (body.title !== undefined) {
        if (!body.title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });
        data.title = body.title.trim().slice(0, 60);
    }
    if (body.folder !== undefined) {
        data.folder = body.folder ? body.folder.trim().slice(0, 40) : null;
    }
    if (typeof body.pinned === "boolean") data.pinned = body.pinned;
    if (typeof body.archived === "boolean") {
        data.archived = body.archived;
        if (body.archived) data.pinned = false;
    }
    if (body.activePersonaId !== undefined) {
        data.activePersonaId = body.activePersonaId ? String(body.activePersonaId) : null;
    }

    const updated = await prisma.chat.update({ where: { id: chatId }, data });
    dispatchWebhook(userId, "chat.updated", { id: updated.id, title: updated.title, updatedAt: updated.updatedAt }).catch(() => {});
    return NextResponse.json(updated);
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ chatId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chatId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";
    const permanent = new URL(req.url).searchParams.get("permanent") === "true";

    // Delete requires ownership or workspace owner/admin role
    const allowed = await canModify(chatId, userId, isAdmin);
    if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (permanent) {
        dispatchWebhook(userId, "chat.deleted", { id: chatId }).catch(() => {});
        await prisma.message.deleteMany({ where: { chatId } });
        await prisma.chat.delete({ where: { id: chatId } });
    } else {
        await prisma.chat.update({ where: { id: chatId }, data: { deletedAt: new Date() } });
    }
    return NextResponse.json({ ok: true });
}
