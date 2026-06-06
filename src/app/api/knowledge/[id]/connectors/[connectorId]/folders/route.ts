import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/connectors/google-oauth";
import { listDriveFolders } from "@/lib/connectors/gdrive";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Lists the connected Drive account's folders so the user can scope the sync to
// one folder instead of the whole Drive.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; connectorId: string }> }) {
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

    try {
        const accessToken = await getValidAccessToken(connector);
        const folders = await listDriveFolders(accessToken);
        return Response.json(folders);
    } catch (err) {
        logger.warn("connector_list_folders_failed", { connectorId, error: String(err).slice(0, 200) });
        return new Response("Failed to list folders", { status: 502 });
    }
}
