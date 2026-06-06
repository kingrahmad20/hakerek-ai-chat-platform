import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { TOOL_LABELS, type ToolName } from "@/lib/agent-tools";
import { MCP_TOOL_PREFIX } from "@/lib/mcp";

// ── Marketplace / library shared types & helpers ──────────────────────────────
// Used by the /api/marketplace and /api/library routes and the chat path. Keeps
// payload shapes, validation, and KB cloning in one place.

export type MarketplaceItemType = "persona" | "slash_command" | "knowledge_base";
export type MarketplaceVisibility = "public" | "workspace" | "unlisted";
export type LibraryItemType = "persona" | "slash_command";

export const ITEM_TYPES: MarketplaceItemType[] = ["persona", "slash_command", "knowledge_base"];
export const VISIBILITIES: MarketplaceVisibility[] = ["public", "workspace", "unlisted"];

export function isItemType(v: unknown): v is MarketplaceItemType {
    return typeof v === "string" && (ITEM_TYPES as string[]).includes(v);
}
export function isVisibility(v: unknown): v is MarketplaceVisibility {
    return typeof v === "string" && (VISIBILITIES as string[]).includes(v);
}

// ── Payload shapes (what we store in UserLibraryItem.data / MarketplaceItem.payload) ──

export interface PersonaData {
    name: string;
    description: string;
    systemPrompt: string;
    model: string;
    knowledgeBaseIds: string[];
    toolIds: string[];
}

export interface SlashCommandData {
    command: string;
    description: string;
    prompt: string;
}

const VALID_TOOL_NAMES = new Set(Object.keys(TOOL_LABELS) as ToolName[]);

/** Sanitise a persona payload, mirroring the limits in admin/actions.ts savePersonas. */
export function sanitizePersona(raw: unknown): PersonaData | null {
    if (!raw || typeof raw !== "object") return null;
    const p = raw as Record<string, unknown>;
    const name = String(p.name ?? "").trim().slice(0, 100);
    const systemPrompt = String(p.systemPrompt ?? "").trim().slice(0, 4000);
    if (!name || !systemPrompt) return null;
    const toolIds = Array.isArray(p.toolIds)
        ? p.toolIds.filter(
              (t): t is string =>
                  typeof t === "string" &&
                  (t.startsWith(MCP_TOOL_PREFIX) || VALID_TOOL_NAMES.has(t as ToolName)),
          ).slice(0, 50)
        : [];
    return {
        name,
        description: String(p.description ?? "").slice(0, 200),
        systemPrompt,
        model: p.model ? String(p.model).slice(0, 200) : "",
        knowledgeBaseIds: Array.isArray(p.knowledgeBaseIds)
            ? p.knowledgeBaseIds.filter((id): id is string => typeof id === "string").slice(0, 50)
            : [],
        toolIds,
    };
}

/** Sanitise a slash-command payload, mirroring admin/actions.ts saveSlashCommands. */
export function sanitizeSlashCommand(raw: unknown): SlashCommandData | null {
    if (!raw || typeof raw !== "object") return null;
    const c = raw as Record<string, unknown>;
    const command = String(c.command ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "")
        .slice(0, 50);
    const prompt = String(c.prompt ?? "").trim().slice(0, 2000);
    if (!command || !prompt) return null;
    return {
        command,
        description: String(c.description ?? "").slice(0, 150),
        prompt,
    };
}

export function sanitizeLibraryData(type: LibraryItemType, raw: unknown): PersonaData | SlashCommandData | null {
    return type === "persona" ? sanitizePersona(raw) : sanitizeSlashCommand(raw);
}

/** A lightweight cuid-ish id, matching the format used elsewhere for raw-SQL inserts. */
export function generateId(): string {
    const timestamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 10);
    return `c${timestamp}${rand}`;
}

// ── Knowledge-base cloning (full clone WITH embeddings) ───────────────────────
// Copies a source KB's ready documents and their chunks (including the pgvector
// embedding) into a brand-new KB owned by `targetUserId`. No re-embedding.

export async function cloneKnowledgeBase(
    sourceKbId: string,
    targetUserId: string,
    name: string,
    description: string | null,
): Promise<string> {
    const newKb = await prisma.knowledgeBase.create({
        data: { name: name.slice(0, 200), description: description?.slice(0, 1000) || null, userId: targetUserId },
    });

    const docs = await prisma.knowledgeDocument.findMany({
        where: { knowledgeBaseId: sourceKbId, status: "ready" },
        select: { id: true, fileName: true, fileType: true, fileSize: true },
    });

    for (const doc of docs) {
        const newDoc = await prisma.knowledgeDocument.create({
            data: {
                knowledgeBaseId: newKb.id,
                fileName: doc.fileName,
                fileType: doc.fileType,
                fileSize: doc.fileSize,
                status: "ready",
            },
        });

        // Read chunks with the embedding rendered as text, then re-insert with new
        // ids using the same raw-SQL '<vec>'::vector pattern as the upload path.
        const chunks = await prisma.$queryRaw<{ content: string; chunkIndex: number; embedding: string | null }[]>(
            Prisma.sql`
                SELECT content, "chunkIndex", embedding::text AS embedding
                FROM "KnowledgeChunk"
                WHERE "documentId" = ${doc.id}
                ORDER BY "chunkIndex" ASC
            `,
        );

        for (const chunk of chunks) {
            const id = generateId();
            if (chunk.embedding) {
                await prisma.$executeRaw(
                    Prisma.sql`
                        INSERT INTO "KnowledgeChunk" (id, "documentId", content, embedding, "chunkIndex", "createdAt")
                        VALUES (${id}, ${newDoc.id}, ${chunk.content}, ${Prisma.raw(`'${chunk.embedding}'::vector`)}, ${chunk.chunkIndex}, NOW())
                    `,
                );
            } else {
                await prisma.$executeRaw(
                    Prisma.sql`
                        INSERT INTO "KnowledgeChunk" (id, "documentId", content, "chunkIndex", "createdAt")
                        VALUES (${id}, ${newDoc.id}, ${chunk.content}, ${chunk.chunkIndex}, NOW())
                    `,
                );
            }
        }
    }

    return newKb.id;
}

// ── Visibility / access checks ────────────────────────────────────────────────

/** Returns true if `userId` (may be null for anon) can view an item with the given visibility/workspace. */
export async function canViewItem(
    item: { visibility: string; workspaceId: string | null; authorId: string },
    userId: string | null,
): Promise<boolean> {
    if (item.visibility === "public" || item.visibility === "unlisted") return true;
    if (item.visibility === "workspace") {
        if (!userId || !item.workspaceId) return false;
        if (item.authorId === userId) return true;
        const member = await prisma.workspaceMember.findFirst({
            where: { workspaceId: item.workspaceId, userId },
            select: { id: true },
        });
        return !!member;
    }
    return false;
}
