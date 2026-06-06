import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Loads a connector and enforces that it belongs to the given KB and the
// current user. Returns null (so the caller 404s) otherwise.
async function authorizeConnector(connectorId: string, kbId: string, userId: string) {
    const connector = await prisma.knowledgeConnector.findUnique({
        where: { id: connectorId },
        include: { knowledgeBase: { select: { userId: true } } },
    });
    if (!connector || connector.knowledgeBaseId !== kbId || connector.knowledgeBase.userId !== userId) {
        return null;
    }
    return connector;
}

// Update a connector's sync config: folder scope, interval, or pause/resume.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; connectorId: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { id, connectorId } = await params;
    const connector = await authorizeConnector(connectorId, id, session.user.id);
    if (!connector) return new Response("Not found", { status: 404 });

    let body: { folderId?: string | null; folderName?: string | null; syncIntervalMin?: number; status?: string };
    try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

    const data: { config?: object; syncIntervalMin?: number; status?: string } = {};

    if (body.folderId !== undefined || body.folderName !== undefined) {
        const current = (connector.config ?? {}) as Record<string, unknown>;
        data.config = {
            ...current,
            folderId: body.folderId ?? null,
            folderName: body.folderName ?? (body.folderId ? current.folderName : "My Drive"),
        };
    }
    if (typeof body.syncIntervalMin === "number") {
        // Clamp to a sane range: 15 min .. 1 week.
        data.syncIntervalMin = Math.max(15, Math.min(body.syncIntervalMin, 10080));
    }
    if (body.status === "active" || body.status === "paused") {
        data.status = body.status;
    }

    const updated = await prisma.knowledgeConnector.update({
        where: { id: connectorId },
        data,
        select: {
            id: true, provider: true, status: true, accountEmail: true, config: true,
            syncIntervalMin: true, lastSyncedAt: true, lastError: true, createdAt: true,
            _count: { select: { documents: true } },
        },
    });
    return Response.json(updated);
}

// Remove a connector. Its synced documents (and chunks) cascade-delete with it.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; connectorId: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { id, connectorId } = await params;
    const connector = await authorizeConnector(connectorId, id, session.user.id);
    if (!connector) return new Response("Not found", { status: 404 });

    await prisma.knowledgeConnector.delete({ where: { id: connectorId } });
    return new Response(null, { status: 204 });
}
