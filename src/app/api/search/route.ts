import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { embedText } from "@/lib/rag";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// Minimum cosine similarity for a semantic hit to be considered relevant.
// text-embedding-3-small puts genuinely related content well above this;
// it filters out the "top 15 of everything" noise for off-topic queries.
const SEMANTIC_MIN_SIMILARITY = 0.2;

function makeSnippet(content: string, query: string, maxLen = 130): string {
    const lower = content.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx === -1) return content.slice(0, maxLen) + (content.length > maxLen ? "…" : "");
    const start = Math.max(0, idx - 45);
    const end = Math.min(content.length, idx + query.length + 75);
    let snippet = content.slice(start, end);
    if (start > 0) snippet = "…" + snippet;
    if (end < content.length) snippet += "…";
    return snippet;
}

export interface SearchResult {
    chatId: string;
    chatTitle: string;
    chatUpdatedAt: string;
    snippet: string;
    matchIn: "title" | "message" | "semantic";
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const mode = searchParams.get("mode") ?? "keyword"; // "keyword" | "semantic"
    if (q.length < 2) return NextResponse.json([]);

    const userId = session.user.id;

    // ── Semantic mode ──────────────────────────────────────────────────────────
    if (mode === "semantic") {
        const settings = await prisma.setting.findMany({ select: { key: true, value: true } });
        const getSetting = (key: string) => settings.find((s) => s.key === key)?.value;

        let apiKey: string | undefined;
        const apiKeysRaw = getSetting("apiKeys");
        if (apiKeysRaw) {
            try {
                const keys: { key: string; active: boolean }[] = JSON.parse(apiKeysRaw);
                apiKey = keys.find((k) => k.active)?.key;
            } catch { /* fall through */ }
        }
        if (!apiKey) apiKey = getSetting("openRouterApiKey");
        if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

        let queryEmbedding: number[];
        try {
            queryEmbedding = await embedText(q, apiKey);
        } catch {
            return NextResponse.json({ error: "Failed to embed query" }, { status: 502 });
        }

        const embeddingStr = `[${queryEmbedding.filter((v) => isFinite(v)).join(",")}]`;

        type SemanticRow = { chatId: string; content: string; chatTitle: string; chatUpdatedAt: Date; similarity: number };
        const rows = await prisma.$queryRaw<SemanticRow[]>(
            Prisma.sql`
                SELECT
                    m."chatId",
                    m.content,
                    c.title       AS "chatTitle",
                    c."updatedAt" AS "chatUpdatedAt",
                    1 - (m.embedding <=> ${Prisma.raw(`'${embeddingStr}'::vector`)}) AS similarity
                FROM "Message" m
                JOIN "Chat"    c ON c.id = m."chatId"
                WHERE c."userId" = ${userId}
                  AND c."deletedAt" IS NULL
                  AND m.embedding IS NOT NULL
                ORDER BY similarity DESC
                LIMIT 40
            `
        );

        const seenChatIds = new Set<string>();
        const results: SearchResult[] = [];
        for (const row of rows) {
            if (row.similarity < SEMANTIC_MIN_SIMILARITY) break; // rows are similarity-sorted
            if (seenChatIds.has(row.chatId)) continue;
            seenChatIds.add(row.chatId);
            results.push({
                chatId: row.chatId,
                chatTitle: row.chatTitle,
                chatUpdatedAt: new Date(row.chatUpdatedAt).toISOString(),
                snippet: makeSnippet(row.content, ""),
                matchIn: "semantic",
            });
            if (results.length >= 15) break;
        }
        return NextResponse.json(results);
    }

    // ── Keyword mode ───────────────────────────────────────────────────────────
    const results: SearchResult[] = [];
    const seenChatIds = new Set<string>();

    // 1. Title matches — always use fast indexed LIKE
    const titleMatches = await prisma.chat.findMany({
        where: { userId, deletedAt: null, title: { contains: q, mode: "insensitive" } },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: { id: true, title: true, updatedAt: true },
    });
    for (const chat of titleMatches) {
        seenChatIds.add(chat.id);
        results.push({
            chatId: chat.id,
            chatTitle: chat.title,
            chatUpdatedAt: chat.updatedAt.toISOString(),
            snippet: makeSnippet(chat.title, q),
            matchIn: "title",
        });
    }

    // 2. Message content — use tsvector GIN index (requires setup-fts.sql to have been applied)
    //    Falls back to ILIKE for very short queries (< 3 chars) where tsvector lexemes don't exist.
    type MsgRow = { chatId: string; content: string; chatTitle: string; chatUpdatedAt: Date };

    let msgRows: MsgRow[] = [];
    const likePattern = `%${q}%`;

    if (q.length >= 3) {
        try {
            // plainto_tsquery turns the raw query into an AND of lexemes — safe against SQL injection
            // via parameterised $1/$2. The GIN index on to_tsvector('simple', content) makes this fast.
            msgRows = await prisma.$queryRaw<MsgRow[]>`
                SELECT
                    m."chatId",
                    m.content,
                    c.title       AS "chatTitle",
                    c."updatedAt" AS "chatUpdatedAt"
                FROM "Message" m
                JOIN "Chat"    c ON c.id = m."chatId"
                WHERE c."userId" = ${userId}
                  AND c."deletedAt" IS NULL
                  AND to_tsvector('simple', m.content) @@ plainto_tsquery('simple', ${q})
                ORDER BY
                    ts_rank(to_tsvector('simple', m.content), plainto_tsquery('simple', ${q})) DESC,
                    c."updatedAt" DESC
                LIMIT 40
            `;
        } catch {
            // If the tsvector index is not set up yet, fall back to ILIKE
            msgRows = await prisma.$queryRaw<MsgRow[]>`
                SELECT
                    m."chatId",
                    m.content,
                    c.title       AS "chatTitle",
                    c."updatedAt" AS "chatUpdatedAt"
                FROM "Message" m
                JOIN "Chat"    c ON c.id = m."chatId"
                WHERE c."userId" = ${userId}
                  AND c."deletedAt" IS NULL
                  AND m.content ILIKE ${likePattern}
                ORDER BY c."updatedAt" DESC
                LIMIT 40
            `;
        }
    } else {
        // Short query: ILIKE is fine — dataset is small or query is too short for lexemes
        msgRows = await prisma.$queryRaw<MsgRow[]>`
            SELECT
                m."chatId",
                m.content,
                c.title       AS "chatTitle",
                c."updatedAt" AS "chatUpdatedAt"
            FROM "Message" m
            JOIN "Chat"    c ON c.id = m."chatId"
            WHERE c."userId" = ${userId}
              AND m.content ILIKE ${likePattern}
            ORDER BY c."updatedAt" DESC
            LIMIT 40
        `;
    }

    for (const row of msgRows) {
        if (seenChatIds.has(row.chatId)) continue;
        seenChatIds.add(row.chatId);
        results.push({
            chatId: row.chatId,
            chatTitle: row.chatTitle,
            chatUpdatedAt: new Date(row.chatUpdatedAt).toISOString(),
            snippet: makeSnippet(row.content, q),
            matchIn: "message",
        });
        if (results.length >= 15) break;
    }

    // Sort: title matches first, then by recency
    results.sort((a, b) => {
        if (a.matchIn === "title" && b.matchIn !== "title") return -1;
        if (a.matchIn !== "title" && b.matchIn === "title") return 1;
        return new Date(b.chatUpdatedAt).getTime() - new Date(a.chatUpdatedAt).getTime();
    });

    return NextResponse.json(results.slice(0, 15));
}
