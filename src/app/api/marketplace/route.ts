import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isItemType } from "@/lib/marketplace";
import type { MarketplaceItemSummary, MarketplaceItemType, MarketplaceVisibility } from "@/types";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace — browse the catalog.
 * Query: type=persona|slash_command|knowledge_base, q=<search>, scope=public|workspace|mine
 */
export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    const url = new URL(req.url);
    const typeParam = url.searchParams.get("type");
    const q = url.searchParams.get("q")?.trim();
    const scope = url.searchParams.get("scope") ?? "public";

    const where: Prisma.MarketplaceItemWhereInput = {};
    if (typeParam && isItemType(typeParam)) where.type = typeParam;
    if (q) {
        where.OR = [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
        ];
    }

    if (scope === "mine") {
        where.authorId = userId;
    } else if (scope === "workspace") {
        const memberships = await prisma.workspaceMember.findMany({ where: { userId }, select: { workspaceId: true } });
        const wsIds = memberships.map((m) => m.workspaceId);
        where.visibility = "workspace";
        where.workspaceId = { in: wsIds.length ? wsIds : ["__none__"] };
    } else {
        where.visibility = "public";
    }

    const items = await prisma.marketplaceItem.findMany({
        where,
        orderBy: [{ installCount: "desc" }, { createdAt: "desc" }],
        take: 200,
        include: { author: { select: { name: true } } },
    });

    // Which of these the current user has already imported (persona/slash_command).
    const importedSourceIds = new Set(
        (await prisma.userLibraryItem.findMany({
            where: { userId, sourceItemId: { in: items.map((i) => i.id) } },
            select: { sourceItemId: true },
        })).map((r) => r.sourceItemId),
    );

    const result: MarketplaceItemSummary[] = items.map((it) => ({
        id: it.id,
        shareToken: it.shareToken,
        type: it.type as MarketplaceItemType,
        visibility: it.visibility as MarketplaceVisibility,
        name: it.name,
        description: it.description,
        authorName: it.author?.name ?? null,
        workspaceId: it.workspaceId,
        installCount: it.installCount,
        viewCount: it.viewCount,
        createdAt: it.createdAt.toISOString(),
        imported: importedSourceIds.has(it.id),
        mine: it.authorId === userId,
    }));

    return NextResponse.json(result);
}
