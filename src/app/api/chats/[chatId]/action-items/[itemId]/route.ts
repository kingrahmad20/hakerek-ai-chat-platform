import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getItem(itemId: string, chatId: string, userId: string, isAdmin: boolean) {
    const item = await prisma.actionItem.findUnique({
        where: { id: itemId },
        select: { id: true, chatId: true, userId: true, text: true, type: true, completed: true, createdAt: true },
    });
    if (!item || item.chatId !== chatId) return null;
    if (!isAdmin && item.userId !== userId) return null;
    return item;
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ chatId: string; itemId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chatId, itemId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    const item = await getItem(itemId, chatId, userId, isAdmin);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const data: { completed?: boolean; text?: string } = {};
    if (typeof body.completed === "boolean") data.completed = body.completed;
    if (typeof body.text === "string" && body.text.trim()) data.text = body.text.trim();

    const updated = await prisma.actionItem.update({
        where: { id: itemId },
        data,
        select: { id: true, text: true, type: true, completed: true, createdAt: true },
    });

    return NextResponse.json({ item: updated });
}

export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ chatId: string; itemId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chatId, itemId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    const item = await getItem(itemId, chatId, userId, isAdmin);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.actionItem.delete({ where: { id: itemId } });

    return NextResponse.json({ ok: true });
}
