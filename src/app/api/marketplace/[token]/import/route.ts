import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewItem, cloneKnowledgeBase, sanitizePersona, sanitizeSlashCommand } from "@/lib/marketplace";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * POST /api/marketplace/[token]/import — import a listing into the caller's account.
 * - persona / slash_command → a new UserLibraryItem (idempotent per user+item).
 * - knowledge_base → a full clone (documents + chunks + embeddings) owned by the caller.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    const { token } = await params;

    const item = await prisma.marketplaceItem.findUnique({ where: { shareToken: token } });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const allowed = await canViewItem(item, userId);
    if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (item.type === "knowledge_base") {
        if (!item.knowledgeBaseId) return NextResponse.json({ error: "Source knowledge base unavailable" }, { status: 410 });
        const source = await prisma.knowledgeBase.findUnique({ where: { id: item.knowledgeBaseId }, select: { id: true } });
        if (!source) return NextResponse.json({ error: "Source knowledge base unavailable" }, { status: 410 });

        const newKbId = await cloneKnowledgeBase(item.knowledgeBaseId, userId, `${item.name} (imported)`, item.description);
        await prisma.marketplaceItem.update({ where: { id: item.id }, data: { installCount: { increment: 1 } } }).catch(() => {});
        notifyAuthor(item.authorId, userId, item.id, item.name);
        return NextResponse.json({ ok: true, type: item.type, knowledgeBaseId: newKbId }, { status: 201 });
    }

    // persona | slash_command — idempotent via the (userId, sourceItemId) unique index.
    const existing = await prisma.userLibraryItem.findFirst({ where: { userId, sourceItemId: item.id }, select: { id: true } });
    if (existing) return NextResponse.json({ ok: true, type: item.type, libraryItemId: existing.id, already: true });

    let data: unknown;
    try { data = JSON.parse(item.payload); } catch { return NextResponse.json({ error: "Corrupt listing" }, { status: 500 }); }
    const clean = item.type === "persona" ? sanitizePersona(data) : sanitizeSlashCommand(data);
    if (!clean) return NextResponse.json({ error: "Corrupt listing" }, { status: 500 });

    const created = await prisma.userLibraryItem.create({
        data: { userId, type: item.type, data: JSON.stringify(clean), sourceItemId: item.id, enabled: true },
    });
    await prisma.marketplaceItem.update({ where: { id: item.id }, data: { installCount: { increment: 1 } } }).catch(() => {});
    notifyAuthor(item.authorId, userId, item.id, item.name);

    return NextResponse.json({ ok: true, type: item.type, libraryItemId: created.id }, { status: 201 });
}

function notifyAuthor(authorId: string, importerId: string, itemId: string, name: string) {
    if (authorId === importerId) return;
    createNotification({
        userId: authorId,
        type: "marketplace_install",
        title: `"${name}" was imported`,
        body: "Someone added your shared item to their library.",
        link: "/marketplace?scope=mine",
        refId: itemId,
        cooldownSeconds: 300,
    }).catch(() => {});
}
