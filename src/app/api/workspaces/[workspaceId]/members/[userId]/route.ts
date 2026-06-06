import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PATCH /api/workspaces/[workspaceId]/members/[userId] — change role (OWNER only)
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ workspaceId: string; userId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId, userId: targetUserId } = await params;

    const caller = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    });
    if (!caller || caller.role !== "OWNER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (targetUserId === session.user.id) {
        return NextResponse.json({ error: "Cannot change own role" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

    const role = body?.role;
    if (!["ADMIN", "MEMBER"].includes(role)) {
        return NextResponse.json({ error: "Role must be ADMIN or MEMBER" }, { status: 400 });
    }

    const updated = await prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
        data: { role },
    });
    return NextResponse.json({ userId: targetUserId, role: updated.role });
}

// DELETE /api/workspaces/[workspaceId]/members/[userId] — remove member (OWNER or ADMIN; cannot remove OWNER)
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ workspaceId: string; userId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId, userId: targetUserId } = await params;

    const [caller, target] = await Promise.all([
        prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
        }),
        prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
        }),
    ]);

    if (!caller) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Members can only remove themselves; OWNER/ADMIN can remove others (not OWNER)
    const isSelf = targetUserId === session.user.id;
    const canManage = caller.role === "OWNER" || caller.role === "ADMIN";

    if (!isSelf && !canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!isSelf && target?.role === "OWNER") {
        return NextResponse.json({ error: "Cannot remove workspace owner" }, { status: 400 });
    }

    await prisma.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    return NextResponse.json({ ok: true });
}
