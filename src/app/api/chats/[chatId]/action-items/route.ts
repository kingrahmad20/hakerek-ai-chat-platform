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
    { params }: { params: Promise<{ chatId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chatId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    const allowed = await canAccess(chatId, userId, isAdmin);
    if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const items = await prisma.actionItem.findMany({
        where: { chatId },
        orderBy: { createdAt: "asc" },
        select: { id: true, text: true, type: true, completed: true, createdAt: true },
    });

    return NextResponse.json({ items });
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ chatId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chatId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    const allowed = await canAccess(chatId, userId, isAdmin);
    if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const type = body.type === "decision" ? "decision" : "task";

    if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

    const item = await prisma.actionItem.create({
        data: { chatId, userId, text, type },
        select: { id: true, text: true, type: true, completed: true, createdAt: true },
    });

    return NextResponse.json({ item }, { status: 201 });
}
