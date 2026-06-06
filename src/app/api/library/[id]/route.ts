import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeLibraryData, type LibraryItemType } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

async function getOwnedItem(id: string, userId: string) {
    const item = await prisma.userLibraryItem.findFirst({ where: { id, userId } });
    return item;
}

/** PATCH /api/library/[id] — edit fields and/or toggle enabled. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const item = await getOwnedItem(id, session.user.id);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let body: { data?: unknown; enabled?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const update: { data?: string; enabled?: boolean } = {};
    if (body.data !== undefined) {
        const clean = sanitizeLibraryData(item.type as LibraryItemType, body.data);
        if (!clean) return NextResponse.json({ error: "Invalid or incomplete data" }, { status: 400 });
        update.data = JSON.stringify(clean);
    }
    if (typeof body.enabled === "boolean") update.enabled = body.enabled;

    if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    await prisma.userLibraryItem.update({ where: { id }, data: update });
    return NextResponse.json({ ok: true });
}

/** DELETE /api/library/[id] — remove a library item (cascades any marketplace listing). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const item = await getOwnedItem(id, session.user.id);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.userLibraryItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
}
