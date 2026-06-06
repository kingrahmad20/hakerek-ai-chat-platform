import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewItem } from "@/lib/marketplace";
import { isAdminRole } from "@/types";

export const dynamic = "force-dynamic";

/** GET /api/marketplace/[token] — single item detail (visibility enforced). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
    const session = await getServerSession(authOptions);
    const { token } = await params;

    const item = await prisma.marketplaceItem.findUnique({
        where: { shareToken: token },
        include: { author: { select: { name: true } } },
    });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const allowed = await canViewItem(item, session?.user.id ?? null);
    if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.marketplaceItem.update({ where: { id: item.id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

    const imported = session
        ? !!(await prisma.userLibraryItem.findFirst({ where: { userId: session.user.id, sourceItemId: item.id }, select: { id: true } }))
        : false;

    return NextResponse.json({
        id: item.id,
        shareToken: item.shareToken,
        type: item.type,
        visibility: item.visibility,
        name: item.name,
        description: item.description,
        authorName: item.author?.name ?? null,
        installCount: item.installCount,
        viewCount: item.viewCount + 1,
        createdAt: item.createdAt.toISOString(),
        imported,
        mine: item.authorId === session?.user.id,
    });
}

/** DELETE /api/marketplace/[token] — unpublish (author or platform admin). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ token: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { token } = await params;

    const item = await prisma.marketplaceItem.findUnique({ where: { shareToken: token }, select: { id: true, authorId: true } });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (item.authorId !== session.user.id && !isAdminRole(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.marketplaceItem.delete({ where: { id: item.id } });
    return NextResponse.json({ ok: true });
}
