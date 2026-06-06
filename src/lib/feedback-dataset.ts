import { prisma } from "@/lib/prisma";

/**
 * Feedback-loop dataset builder.
 *
 * Turns the thumbs-up / thumbs-down reactions captured in `MessageReaction`
 * into an exportable dataset of good / bad completions for offline evals or
 * fine-tuning. Each reacted assistant turn is reconstructed together with the
 * full conversation that preceded it, so the exported records carry real
 * context — not just the last user prompt.
 */

export type DatasetFormat = "sft" | "dpo" | "eval" | "csv";
export type LabelFilter = "good" | "bad" | "all";

export const DATASET_FORMATS: DatasetFormat[] = ["sft", "dpo", "eval", "csv"];
export const LABEL_FILTERS: LabelFilter[] = ["good", "bad", "all"];

export interface ChatMsg {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface FeedbackRecord {
    messageId: string;
    chatId: string;
    model: string | null;
    upvotes: number;
    downvotes: number;
    net: number;
    label: "good" | "bad";
    /** Full conversation prefix, ending with the labeled assistant turn. */
    messages: ChatMsg[];
    /** Text of the last user turn before the completion (convenience field). */
    prompt: string;
    /** Text of the labeled assistant turn. */
    completion: string;
    createdAt: Date;
}

export interface PreferencePair {
    /** Shared conversation context (ends at the user turn). */
    input: ChatMsg[];
    prompt: string;
    preferred: string;
    rejected: string;
}

export interface DatasetStats {
    total: number;
    good: number;
    bad: number;
    /** Number of preference pairs available for DPO export. */
    pairs: number;
}

/** Pull plain text out of a stored Message.content (string | {text} | {parts}). */
function extractText(content: string): string {
    if (typeof content !== "string") return "";
    try {
        const parsed = JSON.parse(content);
        if (typeof parsed === "string") return parsed;
        if (parsed && typeof parsed.text === "string") return parsed.text;
        const parts = Array.isArray(parsed?.parts) ? parsed.parts : Array.isArray(parsed) ? parsed : null;
        if (parts) {
            return parts
                .filter((p: { type?: string; text?: string }) => p?.type === "text" && p.text)
                .map((p: { text: string }) => p.text)
                .join("\n");
        }
    } catch {
        /* not JSON — fall through to raw content */
    }
    return content;
}

/**
 * Reconstruct reaction-labeled records, newest feedback first. A message whose
 * up- and down-votes cancel out (net === 0) is skipped as ambiguous.
 */
export async function buildFeedbackRecords(opts: {
    rangeDays?: number;
    limit?: number;
} = {}): Promise<FeedbackRecord[]> {
    const limit = Math.min(20000, Math.max(1, opts.limit ?? 5000));

    const where: { type: { in: string[] }; createdAt?: { gte: Date } } = {
        type: { in: ["thumbs_up", "thumbs_down"] },
    };
    if (opts.rangeDays && opts.rangeDays > 0) {
        const start = new Date();
        start.setDate(start.getDate() - opts.rangeDays);
        where.createdAt = { gte: start };
    }

    const grouped = await prisma.messageReaction.groupBy({
        by: ["messageId", "type"],
        where,
        _count: { id: true },
    });
    if (grouped.length === 0) return [];

    const tally = new Map<string, { up: number; down: number }>();
    for (const g of grouped) {
        const t = tally.get(g.messageId) ?? { up: 0, down: 0 };
        if (g.type === "thumbs_up") t.up += g._count.id;
        else t.down += g._count.id;
        tally.set(g.messageId, t);
    }

    // Only assistant turns can be completions worth labeling.
    const assistantMsgs = await prisma.message.findMany({
        where: { id: { in: [...tally.keys()] }, role: "assistant" },
        select: { id: true, chatId: true, createdAt: true, model: true },
    });
    if (assistantMsgs.length === 0) return [];

    // Pull every (non-thread) message for the relevant chats once, then slice
    // each conversation prefix in memory rather than querying per record.
    const chatIds = [...new Set(assistantMsgs.map((m) => m.chatId))];
    const allMsgs = await prisma.message.findMany({
        where: { chatId: { in: chatIds }, parentMessageId: null },
        select: { id: true, chatId: true, role: true, content: true, createdAt: true },
        orderBy: { createdAt: "asc" },
    });
    const byChat = new Map<string, typeof allMsgs>();
    for (const m of allMsgs) {
        const arr = byChat.get(m.chatId);
        if (arr) arr.push(m);
        else byChat.set(m.chatId, [m]);
    }

    // Newest feedback first so the limit keeps the most recent signal.
    assistantMsgs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const records: FeedbackRecord[] = [];
    for (const am of assistantMsgs) {
        const t = tally.get(am.id);
        if (!t) continue;
        const net = t.up - t.down;
        if (net === 0) continue; // ambiguous — votes cancel out
        const label: "good" | "bad" = net > 0 ? "good" : "bad";

        const chatMsgs = byChat.get(am.chatId) ?? [];
        const idx = chatMsgs.findIndex((m) => m.id === am.id);
        if (idx < 0) continue;

        const messages: ChatMsg[] = chatMsgs
            .slice(0, idx + 1)
            .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
            .map((m) => ({ role: m.role as ChatMsg["role"], content: extractText(m.content).trim() }))
            .filter((m) => m.content.length > 0);

        if (messages.length < 2) continue;
        const last = messages[messages.length - 1];
        if (last.role !== "assistant") continue;

        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        if (!lastUser) continue;

        records.push({
            messageId: am.id,
            chatId: am.chatId,
            model: am.model,
            upvotes: t.up,
            downvotes: t.down,
            net,
            label,
            messages,
            prompt: lastUser.content,
            completion: last.content,
            createdAt: am.createdAt,
        });
        if (records.length >= limit) break;
    }

    return records;
}

/**
 * Build DPO-style preference pairs by grouping records that answer the same
 * user prompt and have at least one good and one bad completion. The
 * highest-net good answer is preferred; the most-downvoted bad answer is
 * rejected.
 */
export function buildPreferencePairs(records: FeedbackRecord[]): PreferencePair[] {
    const groups = new Map<string, { good: FeedbackRecord[]; bad: FeedbackRecord[] }>();
    for (const r of records) {
        const key = r.prompt.trim().toLowerCase().slice(0, 500);
        if (!key) continue;
        const g = groups.get(key) ?? { good: [], bad: [] };
        (r.label === "good" ? g.good : g.bad).push(r);
        groups.set(key, g);
    }

    const pairs: PreferencePair[] = [];
    for (const g of groups.values()) {
        if (g.good.length === 0 || g.bad.length === 0) continue;
        const preferred = [...g.good].sort((a, b) => b.net - a.net)[0];
        const rejected = [...g.bad].sort((a, b) => a.net - b.net)[0];
        pairs.push({
            input: preferred.messages.slice(0, -1), // drop the final assistant turn
            prompt: preferred.prompt,
            preferred: preferred.completion,
            rejected: rejected.completion,
        });
    }
    return pairs;
}

export function datasetStats(records: FeedbackRecord[]): DatasetStats {
    const good = records.filter((r) => r.label === "good").length;
    return {
        total: records.length,
        good,
        bad: records.length - good,
        pairs: buildPreferencePairs(records).length,
    };
}

function filterByLabel(records: FeedbackRecord[], label: LabelFilter): FeedbackRecord[] {
    return label === "all" ? records : records.filter((r) => r.label === label);
}

/** Chat-format SFT JSONL: one `{ "messages": [...] }` object per line. */
export function serializeSft(records: FeedbackRecord[], label: LabelFilter): string {
    return filterByLabel(records, label)
        .map((r) => JSON.stringify({ messages: r.messages.map((m) => ({ role: m.role, content: m.content })) }))
        .join("\n");
}

/** OpenAI preference (DPO) JSONL: input + preferred / non-preferred outputs. */
export function serializeDpo(records: FeedbackRecord[]): string {
    return buildPreferencePairs(records)
        .map((p) =>
            JSON.stringify({
                input: { messages: p.input.map((m) => ({ role: m.role, content: m.content })) },
                preferred_output: [{ role: "assistant", content: p.preferred }],
                non_preferred_output: [{ role: "assistant", content: p.rejected }],
            }),
        )
        .join("\n");
}

/** Flat eval JSONL: context + completion + label/metadata for regression evals. */
export function serializeEval(records: FeedbackRecord[], label: LabelFilter): string {
    return filterByLabel(records, label)
        .map((r) =>
            JSON.stringify({
                messages: r.messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
                prompt: r.prompt,
                completion: r.completion,
                label: r.label,
                model: r.model,
                upvotes: r.upvotes,
                downvotes: r.downvotes,
                messageId: r.messageId,
                chatId: r.chatId,
                createdAt: r.createdAt.toISOString(),
            }),
        )
        .join("\n");
}

function csvCell(value: string | number | null): string {
    const s = value === null ? "" : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function serializeCsv(records: FeedbackRecord[], label: LabelFilter): string {
    const header = [
        "label",
        "prompt",
        "completion",
        "model",
        "upvotes",
        "downvotes",
        "net",
        "messageId",
        "chatId",
        "createdAt",
    ];
    const rows = filterByLabel(records, label).map((r) =>
        [
            r.label,
            r.prompt,
            r.completion,
            r.model,
            r.upvotes,
            r.downvotes,
            r.net,
            r.messageId,
            r.chatId,
            r.createdAt.toISOString(),
        ]
            .map(csvCell)
            .join(","),
    );
    return [header.join(","), ...rows].join("\r\n");
}

export interface SerializedDataset {
    body: string;
    contentType: string;
    extension: string;
}

/** Serialize records into the requested export format. */
export function serializeDataset(
    records: FeedbackRecord[],
    format: DatasetFormat,
    label: LabelFilter,
): SerializedDataset {
    switch (format) {
        case "dpo":
            return { body: serializeDpo(records), contentType: "application/x-ndjson; charset=utf-8", extension: "jsonl" };
        case "eval":
            return { body: serializeEval(records, label), contentType: "application/x-ndjson; charset=utf-8", extension: "jsonl" };
        case "csv":
            return { body: serializeCsv(records, label), contentType: "text/csv; charset=utf-8", extension: "csv" };
        case "sft":
        default:
            return { body: serializeSft(records, label), contentType: "application/x-ndjson; charset=utf-8", extension: "jsonl" };
    }
}
