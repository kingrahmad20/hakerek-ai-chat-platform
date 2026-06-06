import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications";
import { indexDocument } from "@/lib/rag";
import { getValidAccessToken } from "@/lib/connectors/google-oauth";
import {
    listDriveFiles,
    extractDriveFileText,
    fingerprintOf,
    type DriveFile,
} from "@/lib/connectors/gdrive";

// Drives a connector's incremental sync: fetch the current set of source items,
// diff them against already-indexed documents by content fingerprint, then
// add/update/delete so the knowledge base mirrors the source. Embedding reuses
// the existing RAG pipeline (indexDocument).

// In-process guard against a connector being synced twice concurrently (e.g. a
// manual trigger racing the cron sweep). Best-effort only — fine for a single
// app instance, and overlap is merely wasteful, not corrupting.
const inFlight = new Set<string>();

async function resolveEmbeddingKey(): Promise<string | null> {
    const settings = await prisma.setting.findMany({ where: { key: { in: ["apiKeys", "openRouterApiKey"] } } });
    const get = (k: string) => settings.find((s) => s.key === k)?.value;
    const apiKeysRaw = get("apiKeys");
    if (apiKeysRaw) {
        try {
            const keys: { key: string; active: boolean }[] = JSON.parse(apiKeysRaw);
            const active = keys.find((k) => k.active)?.key;
            if (active) return active;
        } catch { /* fall through */ }
    }
    return get("openRouterApiKey") ?? null;
}

export interface SyncResult {
    added: number;
    updated: number;
    deleted: number;
    failed: number;
    skipped: number;
}

// Re-extract + re-embed a single Drive file into a KnowledgeDocument row.
// `documentId` is reused on updates so chunks are simply replaced.
async function indexDriveFile(
    documentId: string,
    accessToken: string,
    file: DriveFile,
    apiKey: string,
): Promise<void> {
    const { text, fileType } = await extractDriveFileText(accessToken, file);
    // Replace any existing chunks before re-indexing (no-op for new docs).
    await prisma.knowledgeChunk.deleteMany({ where: { documentId } });
    await indexDocument(documentId, text, apiKey);
    await prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: {
            status: "ready",
            fileType,
            fileSize: file.size ? Number(file.size) : 0,
            errorMessage: null,
            contentHash: fingerprintOf(file),
            externalUrl: file.webViewLink ?? null,
            syncedAt: new Date(),
        },
    });
}

export async function syncConnector(connectorId: string): Promise<SyncResult> {
    const result: SyncResult = { added: 0, updated: 0, deleted: 0, failed: 0, skipped: 0 };

    if (inFlight.has(connectorId)) {
        logger.info("connector_sync_skipped_inflight", { connectorId });
        return result;
    }
    inFlight.add(connectorId);

    try {
        const connector = await prisma.knowledgeConnector.findUnique({ where: { id: connectorId } });
        if (!connector) throw new Error("Connector not found");
        if (connector.status === "paused") {
            logger.info("connector_sync_skipped_paused", { connectorId });
            return result;
        }

        const apiKey = await resolveEmbeddingKey();
        if (!apiKey) throw new Error("Embedding API key not configured");

        const accessToken = await getValidAccessToken(connector);
        const config = (connector.config ?? {}) as { folderId?: string | null };
        const remoteFiles = await listDriveFiles(accessToken, config.folderId ?? null);

        // Existing connector-sourced documents, keyed by their Drive file id.
        const existing = await prisma.knowledgeDocument.findMany({
            where: { connectorId },
            select: { id: true, externalId: true, contentHash: true },
        });
        const byExternalId = new Map(existing.map((d) => [d.externalId ?? "", d]));
        const seen = new Set<string>();

        for (const file of remoteFiles) {
            seen.add(file.id);
            const prior = byExternalId.get(file.id);
            try {
                if (!prior) {
                    const doc = await prisma.knowledgeDocument.create({
                        data: {
                            knowledgeBaseId: connector.knowledgeBaseId,
                            connectorId,
                            source: "gdrive",
                            externalId: file.id,
                            fileName: file.name,
                            fileType: file.mimeType,
                            fileSize: file.size ? Number(file.size) : 0,
                            status: "processing",
                        },
                    });
                    await indexDriveFile(doc.id, accessToken, file, apiKey);
                    result.added++;
                } else if (prior.contentHash !== fingerprintOf(file)) {
                    await prisma.knowledgeDocument.update({
                        where: { id: prior.id },
                        data: { status: "processing", fileName: file.name },
                    });
                    await indexDriveFile(prior.id, accessToken, file, apiKey);
                    result.updated++;
                } else {
                    result.skipped++;
                }
            } catch (err) {
                result.failed++;
                const msg = String(err).slice(0, 500);
                logger.error("connector_file_sync_failed", { connectorId, fileId: file.id, error: msg });
                if (prior) {
                    await prisma.knowledgeDocument
                        .update({ where: { id: prior.id }, data: { status: "error", errorMessage: msg } })
                        .catch(() => {});
                }
                // A brand-new doc that failed to index is left in "processing";
                // it will be retried (and corrected) on the next sync pass.
            }
        }

        // Delete documents whose source file no longer exists in the folder.
        const toDelete = existing.filter((d) => d.externalId && !seen.has(d.externalId));
        if (toDelete.length > 0) {
            await prisma.knowledgeDocument.deleteMany({ where: { id: { in: toDelete.map((d) => d.id) } } });
            result.deleted = toDelete.length;
        }

        await prisma.knowledgeConnector.update({
            where: { id: connectorId },
            data: { lastSyncedAt: new Date(), status: "active", lastError: null },
        });

        logger.info("connector_sync_complete", { connectorId, ...result });

        if (result.added + result.updated + result.deleted > 0) {
            createNotification({
                userId: connector.userId,
                type: "document_ready",
                title: "Knowledge base synced",
                body: `Drive sync: ${result.added} added, ${result.updated} updated, ${result.deleted} removed.`,
                link: "/",
                refId: connectorId,
            }).catch(() => {});
        }
        return result;
    } catch (err) {
        const msg = String(err).slice(0, 500);
        logger.error("connector_sync_failed", { connectorId, error: msg });
        await prisma.knowledgeConnector
            .update({ where: { id: connectorId }, data: { status: "error", lastError: msg, lastSyncedAt: new Date() } })
            .catch(() => {});
        // Surface the failure to the owner so a reconnect/repair is visible.
        const c = await prisma.knowledgeConnector.findUnique({ where: { id: connectorId }, select: { userId: true } }).catch(() => null);
        if (c) {
            createNotification({
                userId: c.userId,
                type: "document_ready",
                title: "Knowledge base sync failed",
                body: msg,
                link: "/",
                refId: connectorId,
            }).catch(() => {});
        }
        return result;
    } finally {
        inFlight.delete(connectorId);
    }
}

// Sweeps connectors that are due for a refresh (used by the cron route).
export async function syncDueConnectors(limit = 25): Promise<{ processed: number }> {
    const now = Date.now();
    const candidates = await prisma.knowledgeConnector.findMany({
        where: { status: { not: "paused" } },
        select: { id: true, lastSyncedAt: true, syncIntervalMin: true },
        orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
        take: limit,
    });
    const due = candidates.filter(
        (c) => !c.lastSyncedAt || now - c.lastSyncedAt.getTime() >= c.syncIntervalMin * 60_000,
    );
    for (const c of due) {
        await syncConnector(c.id);
    }
    return { processed: due.length };
}
