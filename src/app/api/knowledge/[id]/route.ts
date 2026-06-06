import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { id } = await params;
    const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
    if (!kb || kb.userId !== session.user.id) return new Response("Not found", { status: 404 });

    await prisma.knowledgeBase.delete({ where: { id } });
    return new Response(null, { status: 204 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { id } = await params;
    const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
    if (!kb || kb.userId !== session.user.id) return new Response("Not found", { status: 404 });

    let body: { name?: string; description?: string };
    try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

    const updated = await prisma.knowledgeBase.update({
        where: { id },
        data: {
            ...(body.name?.trim() ? { name: body.name.trim() } : {}),
            ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
        },
    });

    return Response.json(updated);
}
