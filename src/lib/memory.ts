import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { embedBatch } from "@/lib/rag";
import { createNotification } from "@/lib/notifications";

const EXTRACTION_PROMPT = `You are a memory extractor. Given a conversation, identify important facts about the USER (not about the AI) that should be remembered for future conversations.

Focus on:
- Personal info: name, location, job, age, family
- Preferences: likes, dislikes, communication style
- Goals: what the user wants to achieve
- Context: ongoing projects, tools they use, constraints

Rules:
- Only extract facts the user clearly stated (no assumptions)
- Each fact must be a short, standalone sentence
- Return a JSON array: [{"content": "...", "category": "personal|preference|goal|context"}]
- Return [] if there is nothing worth remembering
- Maximum 5 facts per extraction

Conversation:
`;

// OpenAI embeddings are unit vectors, so dot product equals cosine similarity
const DEDUP_THRESHOLD = 0.92;

function dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
}

function generateCuid(): string {
    const timestamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 10);
    return `c${timestamp}${rand}`;
}

export async function extractAndSaveMemories(
    userId: string,
    chatId: string,
    messages: { role: string; content: string }[],
    apiKey: string,
    model: string
): Promise<void> {
    if (messages.length < 2) return;

    // Only take the last 10 messages to keep extraction focused
    const recent = messages.slice(-10);
    const convo = recent
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 500)}`)
        .join("\n");

    try {
        const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: "user",
                        content: EXTRACTION_PROMPT + convo + "\n\nReturn only valid JSON, nothing else.",
                    },
                ],
                max_tokens: 512,
                temperature: 0.1,
            }),
            signal: AbortSignal.timeout(15_000),
        });

        if (!resp.ok) return;

        const data = await resp.json();
        const raw: string = data.choices?.[0]?.message?.content ?? "";

        let extracted: { content: string; category: string }[] = [];
        try {
            const jsonMatch = raw.match(/\[[\s\S]*\]/);
            if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
        } catch {
            return;
        }

        if (!Array.isArray(extracted) || extracted.length === 0) return;

        const candidates = extracted
            .filter((e) => e.content && typeof e.content === "string")
            .slice(0, 5)
            .map((e) => ({
                content: e.content.slice(0, 500),
                category: ["personal", "preference", "goal", "context"].includes(e.category)
                    ? e.category
                    : "general",
            }));

        if (candidates.length === 0) return;

        // Try semantic dedup first; fall back to exact-match if embedding fails
        let embeddings: number[][] | null = null;
        try {
            embeddings = await embedBatch(candidates.map((c) => c.content), apiKey);
        } catch {
            // intentional fall-through to exact-match path
        }

        if (!embeddings) {
            // Exact-match fallback (original behavior)
            const existing = await prisma.memory.findMany({
                where: { userId },
                select: { content: true },
            });
            const existingSet = new Set(existing.map((m) => m.content.toLowerCase()));
            const toInsert = candidates
                .filter((c) => !existingSet.has(c.content.toLowerCase()))
                .map((c) => ({ userId, content: c.content, category: c.category, sourceId: chatId }));
            if (toInsert.length > 0) {
                await prisma.memory.createMany({ data: toInsert });
                logger.info("memory_extracted", { userId, chatId, count: toInsert.length });
                createNotification({
                    userId,
                    type: "memory_saved",
                    title: `${toInsert.length} memory fact${toInsert.length !== 1 ? "s" : ""} auto-saved`,
                    body: toInsert.map((m) => m.content).join(" · ").slice(0, 120),
                    link: "/",
                    refId: chatId,
                    cooldownSeconds: 3600,
                }).catch(() => {});
            }
            return;
        }

        // Fetch existing memories with their embeddings
        type ExistingMemory = { content: string; embedding: string | null };
        const existing = await prisma.$queryRaw<ExistingMemory[]>(
            Prisma.sql`SELECT content, embedding::text AS embedding FROM "Memory" WHERE "userId" = ${userId}`
        );

        const existingSet = new Set(existing.map((m) => m.content.toLowerCase()));
        const existingWithEmbeddings = existing
            .filter((m) => m.embedding)
            .map((m) => ({ embedding: JSON.parse(m.embedding!) as number[] }));

        // Filter out exact matches and semantic near-duplicates
        const toInsert: Array<{ content: string; category: string; embedding: number[] }> = [];
        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            const emb = embeddings[i];

            if (existingSet.has(candidate.content.toLowerCase())) continue;

            const isDuplicate = existingWithEmbeddings.some(
                (ex) => dotProduct(emb, ex.embedding) >= DEDUP_THRESHOLD
            );
            if (!isDuplicate) toInsert.push({ ...candidate, embedding: emb });
        }

        if (toInsert.length === 0) return;

        // Insert with embeddings via raw SQL (pgvector requires it)
        for (const item of toInsert) {
            const id = generateCuid();
            const embStr = `[${item.embedding.join(",")}]`;
            await prisma.$executeRaw(
                Prisma.sql`
                    INSERT INTO "Memory" (id, "userId", content, embedding, category, "sourceId", "createdAt", "updatedAt")
                    VALUES (
                        ${id},
                        ${userId},
                        ${item.content},
                        ${Prisma.raw(`'${embStr}'::vector`)},
                        ${item.category},
                        ${chatId},
                        NOW(),
                        NOW()
                    )
                `
            );
        }

        logger.info("memory_extracted", { userId, chatId, count: toInsert.length });
        createNotification({
            userId,
            type: "memory_saved",
            title: `${toInsert.length} memory fact${toInsert.length !== 1 ? "s" : ""} auto-saved`,
            body: toInsert.map((m) => m.content).join(" · ").slice(0, 120),
            link: "/",
            refId: chatId,
            cooldownSeconds: 3600,
        }).catch(() => {});
    } catch (err) {
        logger.warn("memory_extraction_failed", { userId, error: String(err) });
    }
}

export async function getUserMemoriesForPrompt(userId: string): Promise<string> {
    const memories = await prisma.memory.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: { content: true, category: true },
    });

    if (memories.length === 0) return "";

    const lines = memories.map((m) => `- [${m.category}] ${m.content}`).join("\n");
    return `## What you remember about this user:\n${lines}`;
}
