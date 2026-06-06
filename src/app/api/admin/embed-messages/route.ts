import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { embedBatch } from "@/lib/rag";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 20;
const MAX_PER_RUN = 500; // cap per request to avoid timeout

function extractText(content: string): string {
    try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object" && "text" in parsed) return parsed.text ?? "";
    } catch { /* plain text */ }
    return content;
}

export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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

    // Find messages without embeddings
    type RawMsg = { id: string; content: string };
    const messages = await prisma.$queryRaw<RawMsg[]>(
        Prisma.sql`
            SELECT id, content FROM "Message"
            WHERE embedding IS NULL
            ORDER BY "createdAt" DESC
            LIMIT ${MAX_PER_RUN}
        `
    );

    if (messages.length === 0) return NextResponse.json({ embedded: 0, remaining: 0 });

    let embedded = 0;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        const texts = batch.map((m) => extractText(m.content).slice(0, 8191));

        let floatsBatch: number[][];
        try {
            floatsBatch = await embedBatch(texts, apiKey!);
        } catch {
            continue; // skip failed batch, continue others
        }

        for (let j = 0; j < batch.length; j++) {
            const floats = floatsBatch[j];
            if (!floats || !floats.every((v) => typeof v === "number" && isFinite(v))) continue;
            const embeddingStr = `[${floats.join(",")}]`;
            await prisma.$executeRaw(
                Prisma.sql`
                    UPDATE "Message"
                    SET embedding = ${Prisma.raw(`'${embeddingStr}'::vector`)}
                    WHERE id = ${batch[j].id}
                `
            );
            embedded++;
        }
    }

    const remaining = await prisma.$queryRaw<[{ count: bigint }]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "Message" WHERE embedding IS NULL`
    );

    return NextResponse.json({ embedded, remaining: Number(remaining[0].count) });
}
