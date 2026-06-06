import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getMembership(workspaceId: string, userId: string) {
    return prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
    });
}

// GET /api/workspaces/[workspaceId] — full workspace detail with members, folders, invite token
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ workspaceId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId } = await params;
    const member = await getMembership(workspaceId, session.user.id);
    if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [workspace, members, folders, invite] = await Promise.all([
        prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: { _count: { select: { members: true } } },
        }),
        prisma.workspaceMember.findMany({
            where: { workspaceId },
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
            orderBy: { joinedAt: "asc" },
        }),
        prisma.workspaceFolder.findMany({
            where: { workspaceId },
            orderBy: { createdAt: "asc" },
            include: { _count: { select: { chats: true } } },
        }),
        prisma.workspaceInvite.findFirst({
            where: { workspaceId, active: true },
            orderBy: { createdAt: "desc" },
        }),
    ]);

    if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        myRole: member.role,
        memberCount: workspace._count.members,
        theme: workspace.theme ?? null,
        primaryColor: workspace.primaryColor ?? null,
        monthlyBudgetUsd: workspace.monthlyBudgetUsd ?? null,
        members: members.map((m) => ({
            userId: m.user.id,
            name: m.user.name,
            email: m.user.email,
            image: m.user.image,
            role: m.role,
            joinedAt: m.joinedAt.toISOString(),
        })),
        folders: folders.map((f) => ({ id: f.id, name: f.name, _count: f._count })),
        inviteToken: invite?.token ?? null,
    });
}

// PATCH /api/workspaces/[workspaceId] — update name/description (OWNER or ADMIN)
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ workspaceId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId } = await params;
    const member = await getMembership(workspaceId, session.user.id);
    if (!member || (member.role !== "OWNER" && member.role !== "ADMIN")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (body.name !== undefined) {
        const name = body.name?.trim?.();
        if (!name || name.length > 80) return NextResponse.json({ error: "Invalid name" }, { status: 400 });
        data.name = name;
    }
    if (body.description !== undefined) data.description = body.description?.trim?.() || null;
    if (body.theme !== undefined) {
        if (body.theme !== null && body.theme !== "dark" && body.theme !== "light")
            return NextResponse.json({ error: "Invalid theme" }, { status: 400 });
        data.theme = body.theme;
    }
    if (body.primaryColor !== undefined) {
        if (body.primaryColor !== null && !/^#[0-9a-fA-F]{6}$/.test(body.primaryColor))
            return NextResponse.json({ error: "Invalid color" }, { status: 400 });
        data.primaryColor = body.primaryColor;
    }
    if (body.monthlyBudgetUsd !== undefined) {
        if (body.monthlyBudgetUsd === null) {
            data.monthlyBudgetUsd = null;
        } else {
            const budget = Number(body.monthlyBudgetUsd);
            if (!Number.isFinite(budget) || budget < 0 || budget > 1_000_000)
                return NextResponse.json({ error: "Invalid budget" }, { status: 400 });
            data.monthlyBudgetUsd = budget;
        }
        // Changing the cap clears the per-period alert flags so the new threshold
        // re-evaluates from scratch (a raised cap shouldn't stay "at 100%").
        data.budgetPeriod = null;
        data.budgetAlert80 = false;
        data.budgetAlert100 = false;
    }

    const updated = await prisma.workspace.update({ where: { id: workspaceId }, data });
    return NextResponse.json({
        id: updated.id,
        name: updated.name,
        description: updated.description,
        theme: updated.theme ?? null,
        primaryColor: updated.primaryColor ?? null,
        monthlyBudgetUsd: updated.monthlyBudgetUsd ?? null,
    });
}

// DELETE /api/workspaces/[workspaceId] — delete workspace (OWNER only)
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ workspaceId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { workspaceId } = await params;
    const member = await getMembership(workspaceId, session.user.id);
    if (!member || member.role !== "OWNER") {
        return NextResponse.json({ error: "Forbidden — only workspace owner can delete" }, { status: 403 });
    }

    // Unlink chats (set workspaceFolderId to null) before deleting folders/workspace
    await prisma.chat.updateMany({ where: { workspaceFolder: { workspaceId } }, data: { workspaceFolderId: null } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
    return NextResponse.json({ ok: true });
}
