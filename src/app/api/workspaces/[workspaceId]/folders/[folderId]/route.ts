import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PATCH /api/workspaces/[workspaceId]/folders/[folderId] — rename folder
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ workspaceId: string; folderId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId, folderId } = await params;
    const caller = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    });
    if (!caller || (caller.role !== "OWNER" && caller.role !== "ADMIN")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

    const name = body?.name?.trim?.();
    if (!name || name.length > 80) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const folder = await prisma.workspaceFolder.updateMany({
        where: { id: folderId, workspaceId },
        data: { name },
    });
    if (folder.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, name });
}

// DELETE /api/workspaces/[workspaceId]/folders/[folderId] — delete folder and unlink its chats
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ workspaceId: string; folderId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId, folderId } = await params;
    const caller = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    });
    if (!caller || (caller.role !== "OWNER" && caller.role !== "ADMIN")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Unlink chats from this folder (keeps chat history accessible to creators)
    await prisma.chat.updateMany({ where: { workspaceFolderId: folderId }, data: { workspaceFolderId: null } });
    await prisma.workspaceFolder.deleteMany({ where: { id: folderId, workspaceId } });
    return NextResponse.json({ ok: true });
}
