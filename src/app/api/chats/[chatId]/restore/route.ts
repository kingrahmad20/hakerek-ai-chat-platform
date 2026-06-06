import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
    _req: Request,
    { params }: { params: Promise<{ chatId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chatId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        select: { userId: true, deletedAt: true },
    });

    if (!chat || (!isAdmin && chat.userId !== userId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!chat.deletedAt) {
        return NextResponse.json({ error: "Chat is not deleted" }, { status: 400 });
    }

    await prisma.chat.update({
        where: { id: chatId },
        data: { deletedAt: null },
    });

    return NextResponse.json({ ok: true });
}
