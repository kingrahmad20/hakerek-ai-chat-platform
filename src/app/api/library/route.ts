import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeLibraryData, type LibraryItemType } from "@/lib/marketplace";
import type { UserLibraryItemSummary } from "@/types";

export const dynamic = "force-dynamic";

function isLibraryType(v: unknown): v is LibraryItemType {
    return v === "persona" || v === "slash_command";
}

/** GET /api/library — the signed-in user's own personas & slash commands. */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const items = await prisma.userLibraryItem.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        include: { listings: { where: { authorId: session.user.id }, select: { shareToken: true } } },
    });

    const result: UserLibraryItemSummary[] = items.map((it) => {
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(it.data); } catch { /* ignore */ }
        return {
            id: it.id,
            type: it.type as LibraryItemType,
            enabled: it.enabled,
            sourceItemId: it.sourceItemId,
            name: String(data.name ?? data.command ?? ""),
            description: data.description ? String(data.description) : "",
            systemPrompt: data.systemPrompt ? String(data.systemPrompt) : undefined,
            model: data.model ? String(data.model) : undefined,
            knowledgeBaseIds: Array.isArray(data.knowledgeBaseIds) ? (data.knowledgeBaseIds as string[]) : undefined,
            toolIds: Array.isArray(data.toolIds) ? (data.toolIds as string[]) : undefined,
            command: data.command ? String(data.command) : undefined,
            prompt: data.prompt ? String(data.prompt) : undefined,
            publishedToken: it.listings[0]?.shareToken ?? null,
            createdAt: it.createdAt.toISOString(),
        };
    });

    return NextResponse.json(result);
}

/** POST /api/library — create a new user-owned persona or slash command. */
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: { type?: unknown; data?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    if (!isLibraryType(body.type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    const clean = sanitizeLibraryData(body.type, body.data);
    if (!clean) return NextResponse.json({ error: "Invalid or incomplete data" }, { status: 400 });

    const item = await prisma.userLibraryItem.create({
        data: { userId: session.user.id, type: body.type, data: JSON.stringify(clean), enabled: true },
    });

    return NextResponse.json({ id: item.id }, { status: 201 });
}
