import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncConnector } from "@/lib/connectors/sync";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Manually trigger a sync now (bypasses the interval). Runs asynchronously and
// returns 202 — the UI polls the documents/connectors list for results.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; connectorId: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { id, connectorId } = await params;
    const connector = await prisma.knowledgeConnector.findUnique({
        where: { id: connectorId },
        include: { knowledgeBase: { select: { userId: true } } },
    });
    if (!connector || connector.knowledgeBaseId !== id || connector.knowledgeBase.userId !== session.user.id) {
        return new Response("Not found", { status: 404 });
    }

    setImmediate(() => {
        syncConnector(connectorId).catch((err) => {
            logger.error("connector_manual_sync_failed", { connectorId, error: String(err).slice(0, 300) });
        });
    });

    return Response.json({ status: "syncing" }, { status: 202 });
}
