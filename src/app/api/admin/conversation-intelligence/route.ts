import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// Greedy single-pass clustering of question embeddings. OpenAI embeddings are
// (near) unit-length, but we compute true cosine so this is robust regardless.
const CLUSTER_THRESHOLD = 0.8;
const MAX_CLUSTER_CANDIDATES = 250;

function parseEmbedding(raw: string | null): number[] | null {
    if (!raw) return null;
    try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) && arr.length > 0 ? (arr as number[]) : null;
    } catch {
        return null;
    }
}

function cosine(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

interface QuestionRow {
    chatId: string;
    question: string | null;
    sentiment: string;
    created: Date;
    embedding: string | null;
}

interface Cluster {
    seed: number[];
    question: string;
    chatId: string;
    size: number;
    negative: number;
    recent: number; // created in the newer half of the range
    earlier: number;
}

export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role;
    if (!role || (role !== "ADMIN" && role !== "content_moderator")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const range = Math.min(90, Math.max(7, parseInt(request.nextUrl.searchParams.get("range") ?? "30")));
    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - range);
    const midpoint = new Date();
    midpoint.setDate(midpoint.getDate() - Math.floor(range / 2));

    const [
        totalChats,
        analyzedChats,
        topicRows,
        sentimentRows,
        dailyRows,
        flaggedRows,
        questionRows,
    ] = await Promise.all([
        prisma.chat.count({ where: { deletedAt: null } }),
        prisma.chatInsight.count({ where: { chat: { deletedAt: null } } }),
        prisma.$queryRaw<Array<{ topic: string; count: bigint }>>(Prisma.sql`
            SELECT lower(topic) AS topic, COUNT(*)::int AS count
            FROM "ChatInsight" ci
            JOIN "Chat" c ON c.id = ci."chatId"
            CROSS JOIN LATERAL unnest(ci.topics) AS topic
            WHERE c."deletedAt" IS NULL AND c."createdAt" >= ${rangeStart}
            GROUP BY lower(topic)
            ORDER BY count DESC
            LIMIT 20
        `),
        prisma.$queryRaw<Array<{ sentiment: string; count: bigint; avg: number | null }>>(Prisma.sql`
            SELECT ci.sentiment, COUNT(*)::int AS count, AVG(ci."sentimentScore") AS avg
            FROM "ChatInsight" ci
            JOIN "Chat" c ON c.id = ci."chatId"
            WHERE c."deletedAt" IS NULL AND c."createdAt" >= ${rangeStart}
            GROUP BY ci.sentiment
        `),
        prisma.$queryRaw<Array<{ date: Date; positive: number; negative: number; total: number }>>(Prisma.sql`
            SELECT c."createdAt"::date AS date,
                   SUM(CASE WHEN ci.sentiment = 'positive' THEN 1 ELSE 0 END)::int AS positive,
                   SUM(CASE WHEN ci.sentiment = 'negative' THEN 1 ELSE 0 END)::int AS negative,
                   COUNT(*)::int AS total
            FROM "ChatInsight" ci
            JOIN "Chat" c ON c.id = ci."chatId"
            WHERE c."deletedAt" IS NULL AND c."createdAt" >= ${rangeStart}
            GROUP BY c."createdAt"::date
            ORDER BY date ASC
        `),
        prisma.$queryRaw<Array<{
            chatId: string; title: string; primaryQuestion: string | null;
            sentimentScore: number; topics: string[]; createdAt: Date;
            email: string | null; name: string | null;
        }>>(Prisma.sql`
            SELECT c.id AS "chatId", c.title, ci."primaryQuestion", ci."sentimentScore",
                   ci.topics, c."createdAt", u.email, u.name
            FROM "ChatInsight" ci
            JOIN "Chat" c ON c.id = ci."chatId"
            LEFT JOIN "User" u ON u.id = c."userId"
            WHERE c."deletedAt" IS NULL AND c."createdAt" >= ${rangeStart} AND ci.sentiment = 'negative'
            ORDER BY ci."sentimentScore" ASC, c."createdAt" DESC
            LIMIT 15
        `),
        prisma.$queryRaw<QuestionRow[]>(Prisma.sql`
            SELECT DISTINCT ON (m."chatId")
                   m."chatId" AS "chatId",
                   ci."primaryQuestion" AS question,
                   ci.sentiment AS sentiment,
                   c."createdAt" AS created,
                   m.embedding::text AS embedding
            FROM "Message" m
            JOIN "Chat" c ON c.id = m."chatId"
            JOIN "ChatInsight" ci ON ci."chatId" = c.id
            WHERE m.role = 'user' AND m.embedding IS NOT NULL
              AND c."deletedAt" IS NULL AND c."createdAt" >= ${rangeStart}
            ORDER BY m."chatId", m."createdAt" ASC
            LIMIT ${MAX_CLUSTER_CANDIDATES}
        `),
    ]);

    // ── Topics ──────────────────────────────────────────────────────────────
    const topics = topicRows.map((r) => ({ topic: r.topic, count: Number(r.count) }));

    // ── Sentiment summary + trend ───────────────────────────────────────────
    const sentimentCounts: Record<string, number> = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
    let scoreSum = 0, scoreN = 0;
    for (const r of sentimentRows) {
        sentimentCounts[r.sentiment] = Number(r.count);
        if (r.avg !== null) { scoreSum += Number(r.avg) * Number(r.count); scoreN += Number(r.count); }
    }
    const avgSentimentScore = scoreN > 0 ? scoreSum / scoreN : 0;

    const dailySentiment = dailyRows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        positive: Number(r.positive),
        negative: Number(r.negative),
        total: Number(r.total),
    }));

    // ── Flagged (negative) conversations ────────────────────────────────────
    const flagged = flaggedRows.map((r) => ({
        chatId: r.chatId,
        title: r.title,
        primaryQuestion: r.primaryQuestion,
        sentimentScore: r.sentimentScore,
        topics: Array.isArray(r.topics) ? r.topics : [],
        createdAt: r.createdAt.toISOString(),
        userEmail: r.email,
        userName: r.name,
    }));

    // ── Trending questions via greedy embedding clustering ──────────────────
    const clusters: Cluster[] = [];
    for (const row of questionRows) {
        const emb = parseEmbedding(row.embedding);
        if (!emb) continue;
        const isRecent = row.created >= midpoint;
        const isNeg = row.sentiment === "negative";

        let best: Cluster | null = null;
        let bestSim = CLUSTER_THRESHOLD;
        for (const c of clusters) {
            const sim = cosine(emb, c.seed);
            if (sim >= bestSim) { bestSim = sim; best = c; }
        }
        if (best) {
            best.size++;
            if (isNeg) best.negative++;
            if (isRecent) best.recent++; else best.earlier++;
            // Prefer a non-empty representative question if the seed lacked one.
            if (!best.question && row.question) best.question = row.question;
        } else {
            clusters.push({
                seed: emb,
                question: row.question ?? "",
                chatId: row.chatId,
                size: 1,
                negative: isNeg ? 1 : 0,
                recent: isRecent ? 1 : 0,
                earlier: isRecent ? 0 : 1,
            });
        }
    }

    const trendingQuestions = clusters
        .filter((c) => c.size >= 2 && c.question)
        .sort((a, b) => b.size - a.size)
        .slice(0, 12)
        .map((c) => ({
            question: c.question,
            chatId: c.chatId,
            count: c.size,
            recent: c.recent,
            earlier: c.earlier,
            negativeShare: c.size > 0 ? Math.round((c.negative / c.size) * 100) : 0,
        }));

    return NextResponse.json({
        coverage: { analyzed: analyzedChats, total: totalChats },
        topics,
        sentiment: {
            counts: sentimentCounts,
            avgScore: parseFloat(avgSentimentScore.toFixed(3)),
            daily: dailySentiment,
        },
        trendingQuestions,
        flagged,
        range,
    });
}
