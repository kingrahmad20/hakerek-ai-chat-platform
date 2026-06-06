import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/workspaces/[workspaceId]/invite — create (or refresh) an invite link (OWNER or ADMIN)
export async function POST(
    _req: Request,
    { params }: { params: Promise<{ workspaceId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId } = await params;
    const caller = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    });
    if (!caller || (caller.role !== "OWNER" && caller.role !== "ADMIN")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Deactivate existing invites and create a fresh one
    await prisma.workspaceInvite.updateMany({ where: { workspaceId, active: true }, data: { active: false } });
    const invite = await prisma.workspaceInvite.create({ data: { workspaceId } });

    return NextResponse.json({ token: invite.token });
}

// DELETE /api/workspaces/[workspaceId]/invite — revoke all active invite links
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ workspaceId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId } = await params;
    const caller = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    });
    if (!caller || (caller.role !== "OWNER" && caller.role !== "ADMIN")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.workspaceInvite.updateMany({ where: { workspaceId, active: true }, data: { active: false } });
    return NextResponse.json({ ok: true });
}
