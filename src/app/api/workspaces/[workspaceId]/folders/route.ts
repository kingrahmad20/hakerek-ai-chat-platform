import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/workspaces/[workspaceId]/folders — list folders
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ workspaceId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId } = await params;
    const caller = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    });
    if (!caller) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const folders = await prisma.workspaceFolder.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { chats: true } } },
    });

    return NextResponse.json(folders.map((f) => ({ id: f.id, name: f.name, _count: f._count })));
}

// POST /api/workspaces/[workspaceId]/folders — create folder (OWNER or ADMIN)
export async function POST(
    req: Request,
    { params }: { params: Promise<{ workspaceId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId } = await params;
    const caller = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    });
    if (!caller || (caller.role !== "OWNER" && caller.role !== "ADMIN")) {
        return NextResponse.json({ error: "Forbidden — only owners and admins can create folders" }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

    const name = body?.name?.trim?.();
    if (!name || name.length > 80) return NextResponse.json({ error: "Folder name required (max 80 chars)" }, { status: 400 });

    const folder = await prisma.workspaceFolder.create({ data: { workspaceId, name } });
    return NextResponse.json({ id: folder.id, name: folder.name, chats: [], _count: { chats: 0 } }, { status: 201 });
}
