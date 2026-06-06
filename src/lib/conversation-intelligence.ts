/* eslint-disable @typescript-eslint/no-explicit-any */
// Conversation intelligence: a per-Chat LLM pass that auto-tags topics, flags
// sentiment, and extracts the user's canonical question. Results land in the
// `ChatInsight` table and feed the admin "Intelligence" tab.
//
// The batch runner mirrors the embed-messages backfill: capped per invocation,
// concurrency-limited, and idempotent (a chat is re-analyzed only when new
// messages have arrived since its last analysis).
import { generateText } from "ai";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createAIModel, type ProviderApiKeys } from "@/lib/ai-providers";

/** Min user+assistant messages before a chat is worth analyzing. */
export const MIN_MESSAGES_FOR_ANALYSIS = 2;
/** Max chats analyzed per POST so the request doesn't time out. */
export const MAX_CHATS_PER_RUN = 60;
/** Max in-flight LLM calls. Keeps a backfill from hammering the provider. */
const CONCURRENCY = 4;
/** Transcript chars sent to the model. Keeps token cost bounded on long chats. */
const MAX_TRANSCRIPT_CHARS = 12_000;

const SENTIMENTS = ["positive", "neutral", "negative", "mixed"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export interface ChatInsightResult {
    topics: string[];
    sentiment: Sentiment;
    sentimentScore: number;
    primaryQuestion: string | null;
    language: string | null;
}

export interface AiConfig {
    apiKey: string;
    model: string;
    providerKeys: ProviderApiKeys;
}

// ── Settings / config ─────────────────────────────────────────────────────────

/** Resolve the AI config (active OpenRouter key, default model, provider keys). */
export async function loadAiConfig(): Promise<AiConfig | null> {
    const settings = await prisma.setting.findMany();
    const get = (key: string) => settings.find((s) => s.key === key)?.value;

    let apiKey: string | undefined;
    const apiKeysRaw = get("apiKeys");
    if (apiKeysRaw) {
        try {
            const keys: { key: string; active: boolean }[] = JSON.parse(apiKeysRaw);
            apiKey = keys.find((k) => k.active)?.key;
        } catch { /* fall through */ }
    }
    if (!apiKey) apiKey = get("openRouterApiKey");
    if (!apiKey) return null;

    const model = get("defaultModel") || "openrouter/auto";
    const providerKeys: ProviderApiKeys = (() => {
        try { return JSON.parse(get("providerApiKeys") || "{}"); } catch { return {}; }
    })();

    return { apiKey, model, providerKeys };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Messages store either plain text or a JSON `{ text, ... }` part envelope. */
export function extractMessageText(content: string): string {
    try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object" && "text" in parsed) return parsed.text ?? "";
    } catch { /* plain text */ }
    return content;
}

function buildTranscript(messages: { role: string; content: string }[]): string {
    let out = "";
    for (const m of messages) {
        const text = extractMessageText(m.content).trim();
        if (!text) continue;
        const line = `${m.role === "user" ? "User" : "Assistant"}: ${text}\n\n`;
        if (out.length + line.length > MAX_TRANSCRIPT_CHARS) break;
        out += line;
    }
    return out.trim();
}

/** Run `fn` over `items` with at most `limit` concurrent invocations. */
async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    let idx = 0;
    async function worker() {
        while (idx < items.length) {
            const cur = idx++;
            await fn(items[cur]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// ── LLM analysis ──────────────────────────────────────────────────────────────

const ANALYSIS_SYSTEM =
    "You are a conversation analyst for an AI chat platform. Given a transcript, " +
    "extract structured intelligence about what the user wanted and how it went. " +
    "Reply with ONLY minified JSON of the exact shape " +
    '{"topics": string[], "sentiment": "positive"|"neutral"|"negative"|"mixed", ' +
    '"sentimentScore": number, "primaryQuestion": string, "language": string} ' +
    "and nothing else. Rules: " +
    "topics = 1-4 short lowercase subject tags (1-3 words each, e.g. \"billing\", \"python errors\"); " +
    "sentiment reflects the USER's experience; " +
    "sentimentScore is -1 (frustrated) to 1 (delighted); " +
    "primaryQuestion = the single core question or request from the user, rephrased as one concise sentence; " +
    "language = the ISO 639-1 code of the conversation (e.g. \"en\").";

function normalize(raw: any): ChatInsightResult {
    const topics = Array.isArray(raw?.topics)
        ? Array.from(
              new Set(
                  raw.topics
                      .map((t: any) => String(t).trim().toLowerCase().slice(0, 40))
                      .filter(Boolean)
              )
          ).slice(0, 4) as string[]
        : [];

    const sentiment: Sentiment = SENTIMENTS.includes(raw?.sentiment)
        ? raw.sentiment
        : "neutral";

    let score = typeof raw?.sentimentScore === "number" ? raw.sentimentScore : Number(raw?.sentimentScore);
    if (!Number.isFinite(score)) score = 0;
    score = Math.max(-1, Math.min(1, score));

    const primaryQuestion = raw?.primaryQuestion
        ? String(raw.primaryQuestion).trim().replace(/\s+/g, " ").slice(0, 300)
        : null;

    const language = raw?.language
        ? String(raw.language).trim().toLowerCase().slice(0, 8) || null
        : null;

    return { topics, sentiment, sentimentScore: score, primaryQuestion, language };
}

/** Analyze a single transcript. Throws on provider/parse failure. */
export async function analyzeTranscript(transcript: string, config: AiConfig): Promise<ChatInsightResult> {
    const result = await generateText({
        model: createAIModel(config.model, config.apiKey, config.providerKeys),
        messages: [
            { role: "system", content: ANALYSIS_SYSTEM },
            { role: "user", content: `Transcript:\n\n${transcript}\n\nAnalyze it.` },
        ],
        maxOutputTokens: 300,
    } as any);

    const text = (result.text || "").trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON found in analysis response");
    return normalize(JSON.parse(match[0]));
}

// ── Batch runner ──────────────────────────────────────────────────────────────

export interface AnalyzeBatchResult {
    analyzed: number;
    failed: number;
    remaining: number;
}

/**
 * Find chats that need analysis (enough messages, and either never analyzed or
 * stale relative to current message count) and analyze up to `limit` of them.
 * Returns how many were processed and how many still remain.
 */
export async function analyzePendingChats(config: AiConfig, limit = MAX_CHATS_PER_RUN): Promise<AnalyzeBatchResult> {
    // Candidate chats with their analyzable message count and last-analyzed count.
    const candidates = await prisma.chat.findMany({
        where: {
            deletedAt: null,
            messages: { some: { role: { in: ["user", "assistant"] }, parentMessageId: null } },
        },
        select: {
            id: true,
            _count: { select: { messages: { where: { role: { in: ["user", "assistant"] }, parentMessageId: null } } } },
            insight: { select: { messageCount: true } },
        },
        orderBy: { updatedAt: "desc" },
    });

    const pending = candidates.filter((c) => {
        const count = c._count.messages;
        if (count < MIN_MESSAGES_FOR_ANALYSIS) return false;
        if (!c.insight) return true;
        return c.insight.messageCount < count; // new messages since last analysis
    });

    const batch = pending.slice(0, limit);

    let analyzed = 0;
    let failed = 0;

    await mapPool(batch, CONCURRENCY, async (chat) => {
        try {
            const messages = await prisma.message.findMany({
                where: { chatId: chat.id, parentMessageId: null, role: { in: ["user", "assistant"] } },
                orderBy: { createdAt: "asc" },
                select: { role: true, content: true },
            });
            const transcript = buildTranscript(messages);
            if (!transcript) return;

            const insight = await analyzeTranscript(transcript, config);

            await prisma.chatInsight.upsert({
                where: { chatId: chat.id },
                create: {
                    chatId: chat.id,
                    topics: insight.topics,
                    sentiment: insight.sentiment,
                    sentimentScore: insight.sentimentScore,
                    primaryQuestion: insight.primaryQuestion,
                    language: insight.language,
                    model: config.model,
                    messageCount: chat._count.messages,
                },
                update: {
                    topics: insight.topics,
                    sentiment: insight.sentiment,
                    sentimentScore: insight.sentimentScore,
                    primaryQuestion: insight.primaryQuestion,
                    language: insight.language,
                    model: config.model,
                    messageCount: chat._count.messages,
                    analyzedAt: new Date(),
                },
            });
            analyzed++;
        } catch (err) {
            failed++;
            logger.warn("chat_insight_failed", { chatId: chat.id, error: String(err).slice(0, 300) });
        }
    });

    return { analyzed, failed, remaining: Math.max(0, pending.length - analyzed) };
}
