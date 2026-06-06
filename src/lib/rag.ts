import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const RETRIEVE_K = 20; // candidates fetched before reranking
const RERANK_TOP_K = 5; // final results returned to LLM
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const COHERE_RERANK_MODEL = "rerank-v3.5";

// ── Text utilities ────────────────────────────────────────────────────────────

export function chunkText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;
    const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    while (start < normalized.length) {
        const end = Math.min(start + CHUNK_SIZE, normalized.length);
        chunks.push(normalized.slice(start, end).trim());
        if (end >= normalized.length) break;
        start += CHUNK_SIZE - CHUNK_OVERLAP;
    }
    return chunks.filter((c) => c.length > 50);
}

// ── Embedding ─────────────────────────────────────────────────────────────────

export async function embedText(text: string, apiKey: string): Promise<number[]> {
    const resp = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 8191) }),
        signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Embedding API ${resp.status}: ${body}`);
    }
    const data = await resp.json();
    return data.data[0].embedding as number[];
}

export async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
    const resp = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts.map((t) => t.slice(0, 8191)) }),
        signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Embedding API ${resp.status}: ${body}`);
    }
    const data = await resp.json();
    return (data.data as { index: number; embedding: number[] }[])
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
}

// ── Document parsing ──────────────────────────────────────────────────────────

// Walk a pptx2json slide JSON tree and collect all `a:t` text node values.
function collectPptxText(node: unknown, out: string[]): void {
    if (typeof node === "string") { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach((n) => collectPptxText(n, out)); return; }
    if (node && typeof node === "object") {
        for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
            if (key === "a:t") collectPptxText(val, out);
            else collectPptxText(val, out);
        }
    }
}

// Minimal RTF-to-text extractor: handles control words, hex escapes, and groups.
function extractTextFromRtf(buffer: Buffer): string {
    const src = buffer.toString("latin1");
    let out = "";
    let i = 0;
    let depth = 0;
    // depth at which an ignorable {\* ...} group started; Infinity = not inside one
    let ignoreAt = Infinity;

    while (i < src.length) {
        const ch = src[i];
        if (ch === "{") {
            depth++;
            i++;
            // detect ignorable destination marker {\*
            if (src[i] === "\\" && src[i + 1] === "*") {
                if (depth < ignoreAt) ignoreAt = depth;
            }
        } else if (ch === "}") {
            if (depth === ignoreAt) ignoreAt = Infinity;
            depth--;
            i++;
        } else if (ch === "\\") {
            i++;
            if (i >= src.length) break;
            const next = src[i];
            if (next === "'") {
                // hex-encoded character: \'xx
                const hex = src.slice(i + 1, i + 3);
                i += 3;
                if (depth < ignoreAt) out += String.fromCharCode(parseInt(hex, 16) || 32);
            } else if (/[a-zA-Z]/.test(next)) {
                // control word
                let word = "";
                while (i < src.length && /[a-zA-Z]/.test(src[i])) word += src[i++];
                // consume optional numeric param
                if (i < src.length && (src[i] === "-" || /\d/.test(src[i]))) {
                    if (src[i] === "-") i++;
                    while (i < src.length && /\d/.test(src[i])) i++;
                }
                // consume optional trailing space delimiter
                if (i < src.length && src[i] === " ") i++;

                if (depth < ignoreAt) {
                    if (word === "par" || word === "pard" || word === "sect" || word === "page") out += "\n";
                    else if (word === "line") out += "\n";
                    else if (word === "tab") out += "\t";
                    // fonttbl, colortbl, etc. are destinations to skip
                    else if (["fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "fldinst"].includes(word)) {
                        ignoreAt = depth;
                    }
                }
            } else {
                // control symbol — skip it (handles \\ \{ \} etc.)
                if (next === "\n" && depth < ignoreAt) out += "\n";
                i++;
            }
        } else {
            if (depth < ignoreAt && ch !== "\r") out += ch;
            i++;
        }
    }

    return out.replace(/\n{3,}/g, "\n\n").trim();
}

// Parse a spreadsheet (.xlsx/.xls/.csv) into row-oriented text. Each row is
// rendered as `header: value | header: value` so that, after chunking, every
// chunk stays self-describing instead of being a wall of bare cell values.
async function parseSpreadsheet(buffer: Buffer): Promise<string> {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sections: string[] = [];
    for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        if (!sheet) continue;
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        const lines = rows
            .map((row) =>
                Object.entries(row)
                    .filter(([, v]) => v !== "" && v != null)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" | ")
            )
            .filter(Boolean);
        if (lines.length === 0) continue;
        // Prefix the sheet name only when the workbook has more than one sheet.
        const header = wb.SheetNames.length > 1 ? `## Sheet: ${name}\n` : "";
        sections.push(header + lines.join("\n"));
    }
    return sections.join("\n\n");
}

export async function parseDocument(buffer: Buffer, fileType: string): Promise<string> {
    if (fileType === "application/pdf") {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
        const result = await pdfParse(buffer);
        return result.text;
    }
    if (fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileType === "application/msword") {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    }
    if (fileType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const PPTX2Json = require("pptx2json") as new () => { buffer2json(buf: Buffer): Promise<Record<string, unknown>> };
        const converter = new PPTX2Json();
        const json = await converter.buffer2json(buffer);
        // Only process slide files; skip layouts, masters, and media
        const texts: string[] = [];
        for (const [path, content] of Object.entries(json)) {
            if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) {
                collectPptxText(content, texts);
            }
        }
        return texts.filter(Boolean).join("\n");
    }
    if (fileType === "application/rtf" || fileType === "text/rtf") {
        return extractTextFromRtf(buffer);
    }
    if (
        fileType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || // .xlsx
        fileType === "application/vnd.ms-excel" || // .xls
        fileType === "text/csv"
    ) {
        return parseSpreadsheet(buffer);
    }
    // Plain text and all other text/* types
    if (fileType === "text/plain" || fileType.startsWith("text/")) {
        return buffer.toString("utf-8");
    }
    throw new Error(`Unsupported file type: ${fileType}`);
}

// ── Index document ────────────────────────────────────────────────────────────

export async function indexDocument(documentId: string, text: string, apiKey: string): Promise<void> {
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("No extractable text found in document");

    // Embed in batches of 20
    const BATCH = 20;
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH) {
        const batch = chunks.slice(i, i + BATCH);
        const embeddings = await embedBatch(batch, apiKey);
        allEmbeddings.push(...embeddings);
    }

    // Insert chunks with embeddings via raw SQL (pgvector requires it)
    for (let i = 0; i < chunks.length; i++) {
        const id = generateCuid();
        const floats = allEmbeddings[i];
        if (!floats.every((v) => typeof v === "number" && isFinite(v))) {
            throw new Error("Embedding contains non-finite values");
        }
        const embeddingStr = `[${floats.join(",")}]`;
        await prisma.$executeRaw(
            Prisma.sql`
                INSERT INTO "KnowledgeChunk" (id, "documentId", content, embedding, "chunkIndex", "createdAt")
                VALUES (
                    ${id},
                    ${documentId},
                    ${chunks[i]},
                    ${Prisma.raw(`'${embeddingStr}'::vector`)},
                    ${i},
                    NOW()
                )
            `
        );
    }
}

// ── Similarity search ─────────────────────────────────────────────────────────

interface ChunkResult {
    id: string;
    content: string;
    similarity: number;
    documentId: string;
}

async function rerankWithCohere(
    query: string,
    chunks: ChunkResult[],
    cohereApiKey: string
): Promise<ChunkResult[]> {
    const resp = await fetch("https://api.cohere.com/v2/rerank", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${cohereApiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: COHERE_RERANK_MODEL,
            query,
            documents: chunks.map((c) => c.content),
            top_n: RERANK_TOP_K,
        }),
        signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Cohere Rerank ${resp.status}: ${body}`);
    }

    const data = await resp.json();
    return (data.results as { index: number; relevance_score: number }[])
        .map((r) => chunks[r.index]);
}

export async function searchKnowledgeBases(
    query: string,
    knowledgeBaseIds: string[],
    apiKey: string,
    cohereApiKey?: string
): Promise<string> {
    if (knowledgeBaseIds.length === 0) return "";

    // Resolve to ready document IDs
    const docs = await prisma.knowledgeDocument.findMany({
        where: { knowledgeBaseId: { in: knowledgeBaseIds }, status: "ready" },
        select: { id: true, fileName: true, knowledgeBase: { select: { name: true } } },
    });
    if (docs.length === 0) return "";

    const docIds = docs.map((d: { id: string }) => d.id);
    const docMap = new Map(docs.map((d: { id: string; fileName: string; knowledgeBase: { name: string } }) => [d.id, `${d.knowledgeBase.name} / ${d.fileName}`]));

    let queryEmbedding: number[];
    try {
        queryEmbedding = await embedText(query, apiKey);
    } catch (err) {
        logger.warn("rag_embed_query_failed", { error: String(err) });
        return "";
    }

    if (!queryEmbedding.every((v) => typeof v === "number" && isFinite(v))) {
        logger.warn("rag_invalid_query_embedding", {});
        return "";
    }
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Fetch more candidates when reranking is available, fewer otherwise
    const fetchK = cohereApiKey ? RETRIEVE_K : RERANK_TOP_K;

    const candidates = await prisma.$queryRaw<ChunkResult[]>(
        Prisma.sql`
            SELECT kc.id, kc.content, kc."documentId",
                   1 - (kc.embedding <=> ${Prisma.raw(`'${embeddingStr}'::vector`)}) AS similarity
            FROM "KnowledgeChunk" kc
            WHERE kc."documentId" = ANY(${docIds})
              AND kc.embedding IS NOT NULL
            ORDER BY similarity DESC
            LIMIT ${fetchK}
        `
    );

    if (candidates.length === 0) return "";

    let finalResults: ChunkResult[];
    if (cohereApiKey && candidates.length > RERANK_TOP_K) {
        try {
            finalResults = await rerankWithCohere(query, candidates, cohereApiKey);
        } catch (err) {
            logger.warn("rag_rerank_failed", { error: String(err) });
            finalResults = candidates.slice(0, RERANK_TOP_K);
        }
    } else {
        finalResults = candidates.slice(0, RERANK_TOP_K);
    }

    const lines = finalResults.map((r) => {
        const source = docMap.get(r.documentId) ?? "Unknown";
        return `[${source}]\n${r.content}`;
    });

    return `## Relevant Knowledge Base Context:\n${lines.join("\n\n---\n\n")}`;
}

// ── Message embedding ─────────────────────────────────────────────────────────

export async function embedAndSaveMessage(messageId: string, text: string, apiKey: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    const floats = await embedText(trimmed, apiKey);
    if (!floats.every((v) => typeof v === "number" && isFinite(v))) return;
    const embeddingStr = `[${floats.join(",")}]`;
    await prisma.$executeRaw(
        Prisma.sql`
            UPDATE "Message"
            SET embedding = ${Prisma.raw(`'${embeddingStr}'::vector`)}
            WHERE id = ${messageId}
        `
    );
}

// ── Simple CUID-like generator ────────────────────────────────────────────────

function generateCuid(): string {
    const timestamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 10);
    return `c${timestamp}${rand}`;
}
