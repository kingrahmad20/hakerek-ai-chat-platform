import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string; docId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { id, docId } = await params;
    const doc = await prisma.knowledgeDocument.findUnique({
        where: { id: docId },
        include: { knowledgeBase: { select: { userId: true } } },
    });
    if (!doc || doc.knowledgeBaseId !== id || doc.knowledgeBase.userId !== session.user.id) {
        return new Response("Not found", { status: 404 });
    }

    await prisma.knowledgeDocument.delete({ where: { id: docId } });
    return new Response(null, { status: 204 });
}
