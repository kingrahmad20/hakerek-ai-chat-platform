import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/workspaces/[workspaceId]/folders/[folderId]/chats — list chats in folder
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ workspaceId: string; folderId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId, folderId } = await params;
    const caller = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    });
    if (!caller) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const chats = await prisma.chat.findMany({
        where: { workspaceFolderId: folderId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        select: {
            id: true,
            title: true,
            updatedAt: true,
            userId: true,
            _count: { select: { messages: true } },
        },
    });

    return NextResponse.json(chats.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt.toISOString(),
        userId: c.userId,
        _count: c._count,
    })));
}

// POST /api/workspaces/[workspaceId]/folders/[folderId]/chats — create new chat in workspace folder
export async function POST(
    req: Request,
    { params }: { params: Promise<{ workspaceId: string; folderId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId, folderId } = await params;
    const caller = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    });
    if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Verify folder belongs to this workspace
    const folder = await prisma.workspaceFolder.findFirst({
        where: { id: folderId, workspaceId },
    });
    if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });

    let body: { title?: string } = {};
    try { body = await req.json(); } catch { /* default title */ }

    const title = body?.title?.trim?.() || "New Chat";

    const chat = await prisma.chat.create({
        data: { title, userId: session.user.id, workspaceFolderId: folderId },
        select: {
            id: true,
            title: true,
            updatedAt: true,
            userId: true,
            _count: { select: { messages: true } },
        },
    });

    return NextResponse.json({
        id: chat.id,
        title: chat.title,
        updatedAt: chat.updatedAt.toISOString(),
        userId: chat.userId,
        _count: chat._count,
    }, { status: 201 });
}
