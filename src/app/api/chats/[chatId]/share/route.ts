import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

async function getOwnedChat(chatId: string, userId: string, isAdmin: boolean) {
    const chat = await prisma.chat.findFirst({ where: { id: chatId, deletedAt: null }, select: { userId: true } });
    if (!chat) return null;
    if (chat.userId !== userId && !isAdmin) return null;
    return chat;
}

export async function POST(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { chatId } = await params;
    const owned = await getOwnedChat(chatId, session.user.id, session.user.role === "ADMIN");
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let shareExpiresAt: Date | null = null;
    try {
        const body = await req.json().catch(() => ({}));
        if (body.expiresAt) {
            const d = new Date(body.expiresAt);
            if (!isNaN(d.getTime()) && d > new Date()) shareExpiresAt = d;
        }
    } catch { /* no body */ }

    const shareToken = randomUUID();
    await prisma.chat.update({
        where: { id: chatId },
        data: { shareToken, shareExpiresAt, shareViewCount: 0 },
    });
    return NextResponse.json({ shareToken, shareExpiresAt: shareExpiresAt?.toISOString() ?? null, shareViewCount: 0 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { chatId } = await params;
    const owned = await getOwnedChat(chatId, session.user.id, session.user.role === "ADMIN");
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.chat.update({
        where: { id: chatId },
        data: { shareToken: null, shareExpiresAt: null, shareViewCount: 0 },
    });
    return NextResponse.json({ ok: true });
}
