import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/memories — list all memories for current user
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const memories = await prisma.memory.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, content: true, category: true, sourceId: true, createdAt: true },
    });

    return Response.json(memories);
}

// POST /api/memories — manually add a memory
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return new Response("Invalid body", { status: 400 }); }

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return new Response("content is required", { status: 400 });

    const category = ["personal", "preference", "goal", "context"].includes(body.category)
        ? body.category
        : "general";

    const memory = await prisma.memory.create({
        data: { userId: session.user.id, content: content.slice(0, 500), category },
        select: { id: true, content: true, category: true, sourceId: true, createdAt: true },
    });

    return Response.json(memory, { status: 201 });
}
