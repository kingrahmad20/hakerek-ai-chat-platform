import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const bases = await prisma.knowledgeBase.findMany({
        where: { userId: session.user.id },
        orderBy: { updatedAt: "desc" },
        include: {
            documents: {
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    fileName: true,
                    fileType: true,
                    fileSize: true,
                    status: true,
                    errorMessage: true,
                    createdAt: true,
                    source: true,
                    externalUrl: true,
                    _count: { select: { chunks: true } },
                },
            },
            connectors: {
                orderBy: { createdAt: "desc" },
                select: {
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
                },
            },
        },
    });

    return Response.json(bases);
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    let body: { name?: string; description?: string };
    try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

    const name = body.name?.trim();
    if (!name) return new Response("name is required", { status: 400 });

    const kb = await prisma.knowledgeBase.create({
        data: { name, description: body.description?.trim() || null, userId: session.user.id },
    });

    return Response.json(kb, { status: 201 });
}
