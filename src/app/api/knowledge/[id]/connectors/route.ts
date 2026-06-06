import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Fields safe to return to the client — never expose the encrypted OAuth tokens.
const SAFE_SELECT = {
    id: true,
    provider: true,
    status: true,
    accountEmail: true,
    config: true,
    syncIntervalMin: true,
    lastSyncedAt: true,
    lastError: true,
    createdAt: true,
    _count: { select: { documents: true } },
} as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { id } = await params;
    const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
    if (!kb || kb.userId !== session.user.id) return new Response("Not found", { status: 404 });

    const connectors = await prisma.knowledgeConnector.findMany({
        where: { knowledgeBaseId: id },
        orderBy: { createdAt: "desc" },
        select: SAFE_SELECT,
    });
    return Response.json(connectors);
}
