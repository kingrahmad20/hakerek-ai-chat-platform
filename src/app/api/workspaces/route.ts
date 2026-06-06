import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/workspaces — list all workspaces the user belongs to, with folders and chats
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;

    const memberships = await prisma.workspaceMember.findMany({
        where: { userId },
        include: {
            workspace: {
                include: {
                    _count: { select: { members: true } },
                    folders: {
                        orderBy: { createdAt: "asc" },
                        include: {
                            chats: {
                                orderBy: { updatedAt: "desc" },
                                select: {
                                    id: true,
                                    title: true,
                                    updatedAt: true,
                                    userId: true,
                                    _count: { select: { messages: true } },
                                },
                            },
                        },
                    },
                },
            },
        },
        orderBy: { joinedAt: "asc" },
    });

    const result = memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        description: m.workspace.description,
        myRole: m.role as "OWNER" | "ADMIN" | "MEMBER",
        memberCount: m.workspace._count.members,
        theme: m.workspace.theme ?? null,
        primaryColor: m.workspace.primaryColor ?? null,
        folders: m.workspace.folders.map((f) => ({
            id: f.id,
            name: f.name,
            chats: f.chats.map((c) => ({
                id: c.id,
                title: c.title,
                updatedAt: c.updatedAt.toISOString(),
                userId: c.userId,
                _count: c._count,
            })),
        })),
    }));

    return NextResponse.json(result);
}

// POST /api/workspaces — create a new workspace; creator becomes OWNER
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

    const name = body?.name?.trim?.();
    if (!name || name.length > 80) return NextResponse.json({ error: "Name required (max 80 chars)" }, { status: 400 });

    const description = body?.description?.trim?.() || null;
    const userId = session.user.id;

    const workspace = await prisma.$transaction(async (tx) => {
        const ws = await tx.workspace.create({
            data: { name, description, ownerId: userId },
        });
        await tx.workspaceMember.create({
            data: { workspaceId: ws.id, userId, role: "OWNER" },
        });
        return ws;
    });

    return NextResponse.json({
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        myRole: "OWNER",
        memberCount: 1,
        folders: [],
    }, { status: 201 });
}
