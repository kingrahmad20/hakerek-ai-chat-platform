import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// POST /api/workspace/accept-invite — join workspace via invite token
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

    const token = body?.token?.trim?.();
    if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

    const invite = await prisma.workspaceInvite.findUnique({
        where: { token },
        include: { workspace: { select: { id: true, name: true } } },
    });

    if (!invite || !invite.active) {
        return NextResponse.json({ error: "Invite link is invalid or has expired" }, { status: 410 });
    }

    const userId = session.user.id;
    const workspaceId = invite.workspaceId;

    // Check if already a member
    const existing = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (existing) {
        return NextResponse.json({ workspaceId, name: invite.workspace.name, alreadyMember: true });
    }

    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: "MEMBER" } });

    // Notify workspace owner
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { ownerId: true, name: true },
    });
    const joiner = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    if (workspace) {
        createNotification({
            userId: workspace.ownerId,
            type: "workspace_member_joined",
            title: `New member joined ${workspace.name}`,
            body: `${joiner?.name || joiner?.email || "Someone"} accepted your invite.`,
            link: "/",
            refId: workspaceId,
        }).catch(() => {});
    }

    return NextResponse.json({ workspaceId, name: invite.workspace.name, alreadyMember: false });
}
