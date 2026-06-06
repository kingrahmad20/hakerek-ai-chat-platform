import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isItemType, isVisibility, sanitizePersona, sanitizeSlashCommand } from "@/lib/marketplace";
import { isAdminRole } from "@/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/marketplace/publish
 * Body: { type, sourceId, visibility, workspaceId?, name?, description? }
 * Builds a self-contained listing from a resource the caller owns. Re-publishing
 * the same source updates the existing listing instead of creating a duplicate.
 */
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    let body: { type?: unknown; sourceId?: unknown; visibility?: unknown; workspaceId?: unknown; name?: unknown; description?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    if (!isItemType(body.type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    if (!isVisibility(body.visibility)) return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
    const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
    if (!sourceId) return NextResponse.json({ error: "sourceId is required" }, { status: 400 });

    // Workspace visibility requires a workspace the caller belongs to.
    let workspaceId: string | null = null;
    if (body.visibility === "workspace") {
        if (typeof body.workspaceId !== "string" || !body.workspaceId) {
            return NextResponse.json({ error: "workspaceId is required for workspace visibility" }, { status: 400 });
        }
        const member = await prisma.workspaceMember.findFirst({
            where: { workspaceId: body.workspaceId, userId }, select: { id: true },
        });
        if (!member) return NextResponse.json({ error: "Not a member of that workspace" }, { status: 403 });
        workspaceId = body.workspaceId;
    }

    let name = "";
    let description: string | null = null;
    let payload = "{}";
    let knowledgeBaseId: string | null = null;
    let libraryItemId: string | null = null;

    if (body.type === "knowledge_base") {
        const kb = await prisma.knowledgeBase.findFirst({
            where: { id: sourceId, userId },
            select: { id: true, name: true, description: true, _count: { select: { documents: true } } },
        });
        if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
        const chunkCount = await prisma.knowledgeChunk.count({ where: { document: { knowledgeBaseId: kb.id } } });
        name = kb.name;
        description = kb.description;
        payload = JSON.stringify({ documentCount: kb._count.documents, chunkCount });
        knowledgeBaseId = kb.id;
    } else {
        // persona | slash_command — from the caller's library, or (admins) the global catalog.
        const libItem = await prisma.userLibraryItem.findFirst({
            where: { id: sourceId, userId, type: body.type },
            select: { id: true, data: true },
        });
        let data: Record<string, unknown> | null = null;
        if (libItem) {
            try { data = JSON.parse(libItem.data); } catch { data = null; }
            libraryItemId = libItem.id;
        } else if (isAdminRole(session.user.role)) {
            // Admin may publish a global persona / slash command by id.
            const settingKey = body.type === "persona" ? "personas" : "slashCommands";
            const setting = await prisma.setting.findUnique({ where: { key: settingKey } });
            if (setting) {
                try {
                    const arr: Record<string, unknown>[] = JSON.parse(setting.value);
                    data = arr.find((x) => x.id === sourceId) ?? null;
                } catch { /* ignore */ }
            }
        }
        if (!data) return NextResponse.json({ error: "Source not found" }, { status: 404 });

        const clean = body.type === "persona" ? sanitizePersona(data) : sanitizeSlashCommand(data);
        if (!clean) return NextResponse.json({ error: "Source data is invalid" }, { status: 400 });
        // Personas reference the author's private KBs/tools; strip bindings that
        // won't exist for importers so the shared copy is self-contained.
        if (body.type === "persona") {
            payload = JSON.stringify({ ...clean, knowledgeBaseIds: [], toolIds: [] });
            name = (clean as { name: string }).name;
            description = (clean as { description?: string }).description ?? null;
        } else {
            payload = JSON.stringify(clean);
            name = (clean as { command: string }).command;
            description = (clean as { description?: string }).description ?? null;
        }
    }

    if (typeof body.name === "string" && body.name.trim()) name = body.name.trim().slice(0, 200);
    if (typeof body.description === "string") description = body.description.trim().slice(0, 1000) || null;

    // Update an existing listing for the same source rather than duplicating.
    const existing = await prisma.marketplaceItem.findFirst({
        where: {
            authorId: userId,
            type: body.type,
            ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
            ...(libraryItemId ? { libraryItemId } : {}),
        },
        select: { id: true, shareToken: true },
    });

    if (existing) {
        await prisma.marketplaceItem.update({
            where: { id: existing.id },
            data: { visibility: body.visibility, workspaceId, name, description, payload },
        });
        return NextResponse.json({ id: existing.id, shareToken: existing.shareToken, updated: true });
    }

    const item = await prisma.marketplaceItem.create({
        data: {
            type: body.type,
            visibility: body.visibility,
            authorId: userId,
            workspaceId,
            knowledgeBaseId,
            libraryItemId,
            name,
            description,
            payload,
        },
        select: { id: true, shareToken: true },
    });

    return NextResponse.json({ id: item.id, shareToken: item.shareToken }, { status: 201 });
}
