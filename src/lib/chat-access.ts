import { prisma } from "@/lib/prisma";

/**
 * Shared chat authorization helpers.
 *
 * A chat is "collaborative" when it lives inside a workspace folder
 * (`workspaceFolderId != null`): every member of that workspace may read and
 * post in it. Personal chats remain single-user (owner only).
 *
 * These helpers are reused by the chat CRUD route, the streaming `/api/chat`
 * route, and the real-time SSE/typing endpoints so the access rules stay in
 * one place.
 */

export interface ChatParticipant {
    userId: string;
    name: string | null;
    image: string | null;
    role: "OWNER" | "ADMIN" | "MEMBER";
}

/** Resolve the workspaceId for a chat's folder, or null if the chat isn't in a workspace. */
async function chatWorkspaceId(workspaceFolderId: string | null): Promise<string | null> {
    if (!workspaceFolderId) return null;
    const folder = await prisma.workspaceFolder.findUnique({
        where: { id: workspaceFolderId },
        select: { workspaceId: true },
    });
    return folder?.workspaceId ?? null;
}

/** Whether userId may read/post in this chat: owner, global admin, or workspace member. */
export async function canAccessChat(chatId: string, userId: string, isAdmin: boolean): Promise<boolean> {
    const chat = await prisma.chat.findFirst({
        where: { id: chatId, deletedAt: null },
        select: { userId: true, workspaceFolderId: true },
    });
    if (!chat) return false;
    if (chat.userId === userId || isAdmin) return true;

    const workspaceId = await chatWorkspaceId(chat.workspaceFolderId);
    if (!workspaceId) return false;
    const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { id: true },
    });
    return !!member;
}

/** Whether userId may destructively modify this chat: owner, global admin, or workspace OWNER/ADMIN. */
export async function canModifyChat(chatId: string, userId: string, isAdmin: boolean): Promise<boolean> {
    const chat = await prisma.chat.findFirst({
        where: { id: chatId, deletedAt: null },
        select: { userId: true, workspaceFolderId: true },
    });
    if (!chat) return false;
    if (chat.userId === userId || isAdmin) return true;

    const workspaceId = await chatWorkspaceId(chat.workspaceFolderId);
    if (!workspaceId) return false;
    const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { role: true },
    });
    return member?.role === "OWNER" || member?.role === "ADMIN";
}

/**
 * Participants of a chat: all workspace members for a collaborative chat, or
 * just the owner for a personal chat. Used to render presence avatars and to
 * attribute messages on the client.
 */
export async function getChatParticipants(chatId: string): Promise<ChatParticipant[]> {
    const chat = await prisma.chat.findFirst({
        where: { id: chatId, deletedAt: null },
        select: {
            userId: true,
            workspaceFolderId: true,
            user: { select: { id: true, name: true, image: true } },
        },
    });
    if (!chat) return [];

    const workspaceId = await chatWorkspaceId(chat.workspaceFolderId);
    if (!workspaceId) {
        return [{ userId: chat.user.id, name: chat.user.name, image: chat.user.image, role: "OWNER" }];
    }

    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        select: { role: true, user: { select: { id: true, name: true, image: true } } },
    });
    return members.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        image: m.user.image,
        role: m.role as ChatParticipant["role"],
    }));
}
