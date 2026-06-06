import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PATCH /api/memories/[id] — update memory content
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return new Response("Invalid body", { status: 400 }); }

    const existing = await prisma.memory.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id)
        return new Response("Not found", { status: 404 });

    const content = typeof body.content === "string" ? body.content.trim().slice(0, 500) : existing.content;
    const category = ["personal", "preference", "goal", "context", "general"].includes(body.category)
        ? body.category
        : existing.category;

    const updated = await prisma.memory.update({
        where: { id },
        data: { content, category },
        select: { id: true, content: true, category: true, sourceId: true, createdAt: true },
    });

    return Response.json(updated);
}

// DELETE /api/memories/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { id } = await params;

    const existing = await prisma.memory.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.user.id)
        return new Response("Not found", { status: 404 });

    await prisma.memory.delete({ where: { id } });
    return new Response(null, { status: 204 });
}
