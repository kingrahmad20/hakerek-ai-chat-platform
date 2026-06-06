import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/notifications — list notifications for the current user
export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30"), 50);
    const unreadOnly = url.searchParams.get("unread") === "true";

    const [notifications, unreadCount] = await Promise.all([
        prisma.notification.findMany({
            where: { userId: session.user.id, ...(unreadOnly ? { read: false } : {}) },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: { id: true, type: true, title: true, body: true, link: true, read: true, createdAt: true },
        }),
        prisma.notification.count({ where: { userId: session.user.id, read: false } }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
}

// PATCH /api/notifications — mark all as read
export async function PATCH(_req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await prisma.notification.updateMany({
        where: { userId: session.user.id, read: false },
        data: { read: true },
    });

    return NextResponse.json({ ok: true });
}

// DELETE /api/notifications — delete all notifications for user
export async function DELETE(_req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await prisma.notification.deleteMany({ where: { userId: session.user.id } });
    return NextResponse.json({ ok: true });
}
