import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dispatchWebhook } from "@/lib/webhook";

export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;
    const chats = await prisma.chat.findMany({
        where: { userId, deletedAt: null },
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
        select: {
            id: true,
            title: true,
            updatedAt: true,
            folder: true,
            pinned: true,
            archived: true,
            shareToken: true,
            shareExpiresAt: true,
            shareViewCount: true,
            parentChatId: true,
            _count: { select: { messages: true } },
        },
    });

    return NextResponse.json(chats);
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { title } = await req.json();
    const userId = session.user.id;

    const chat = await prisma.chat.create({
        data: { title: (title as string)?.slice(0, 60) || "New Chat", userId },
    });

    dispatchWebhook(userId, "chat.created", { id: chat.id, title: chat.title, createdAt: chat.createdAt }).catch(() => {});

    return NextResponse.json(chat);
}
