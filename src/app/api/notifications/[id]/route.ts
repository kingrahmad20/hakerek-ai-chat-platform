import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PATCH /api/notifications/[id] — mark a single notification as read
export async function PATCH(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const notification = await prisma.notification.findUnique({ where: { id }, select: { userId: true } });
    if (!notification || notification.userId !== session.user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.notification.update({ where: { id }, data: { read: true } });
    return NextResponse.json({ ok: true });
}

// DELETE /api/notifications/[id] — delete a single notification
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const notification = await prisma.notification.findUnique({ where: { id }, select: { userId: true } });
    if (!notification || notification.userId !== session.user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.notification.delete({ where: { id } });
    return NextResponse.json({ ok: true });
}
