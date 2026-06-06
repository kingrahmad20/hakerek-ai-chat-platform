/* eslint-disable @typescript-eslint/no-explicit-any */
// Prompt / model eval harness. Replays a suite of test prompts across one or
// more models, optionally scoring each response with an LLM-as-judge, so the
// platform's defaultModel / fallbackModels can be tuned with data.
//
// A run is kicked off fire-and-forget from the API route and persists its
// results incrementally; the admin UI polls the run for progress. This mirrors
// the long-running execution model used by scheduled agents.
import { generateText } from "ai";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createAIModel, type ProviderApiKeys } from "@/lib/ai-providers";

const MAX_OUTPUT_CHARS = 8_000;
/** Max in-flight generations. Keeps a wide model sweep from hammering providers. */
const CONCURRENCY = 4;

type SettingMap = Map<string, string>;

async function loadSettings(): Promise<SettingMap> {
    const settings = await prisma.setting.findMany();
    return new Map(settings.map((s) => [s.key, s.value]));
}

/** Active OpenRouter key (multi-key array first, single-key fallback). */
function resolveApiKey(get: (k: string) => string | undefined): string | undefined {
    const apiKeysRaw = get("apiKeys");
    if (apiKeysRaw) {
        try {
            const keys: { key: string; active: boolean }[] = JSON.parse(apiKeysRaw);
            const active = keys.find((k) => k.active)?.key;
            if (active) return active;
        } catch { /* fall through */ }
    }
    return get("openRouterApiKey");
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

const JUDGE_SYSTEM =
    "You are a strict evaluation judge. Grade the assistant response on a 0-10 scale " +
    "for correctness, relevance, and overall quality (10 = excellent, 0 = unusable). " +
    "If a reference answer is provided, weight factual agreement with it heavily. " +
    'Reply with ONLY minified JSON of the exact form {"score": <number 0-10>, "rationale": "<one short sentence>"} ' +
    "and nothing else.";

interface JudgeVerdict {
    score: number | null;
    rationale: string | null;
}

async function judgeResponse(
    judgeModel: string,
    apiKey: string,
    providerKeys: ProviderApiKeys,
    prompt: string,
    expected: string | null,
    output: string,
): Promise<JudgeVerdict> {
    const ref = expected ? `\n\nReference answer / expected:\n${expected}` : "";
    const user = `Prompt:\n${prompt}${ref}\n\nAssistant response:\n${output}\n\nScore it.`;
    const result = await generateText({
        model: createAIModel(judgeModel, apiKey, providerKeys),
        messages: [
            { role: "system", content: JUDGE_SYSTEM },
            { role: "user", content: user },
        ],
    } as any);

    const text = (result.text || "").trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { score: null, rationale: text.slice(0, 500) || null };
    try {
        const parsed = JSON.parse(match[0]);
        const raw = typeof parsed.score === "number" ? parsed.score : Number(parsed.score);
        const score = Number.isFinite(raw) ? Math.max(0, Math.min(10, raw)) : null;
        const rationale = parsed.rationale ? String(parsed.rationale).slice(0, 500) : null;
        return { score, rationale };
    } catch {
        return { score: null, rationale: text.slice(0, 500) || null };
    }
}

interface EvalTask {
    caseId: string;
    prompt: string;
    expected: string | null;
    model: string;
}

/**
 * Execute every (model × case) pair for a run, scoring with the judge model when
 * configured, persisting each result as it completes and flipping the run to
 * "done" (or "error") at the end. Intended to be called fire-and-forget.
 */
export async function executeEvalRun(runId: string): Promise<void> {
    const settings = await loadSettings();
    const get = (k: string) => settings.get(k);
    const apiKey = resolveApiKey(get) ?? "";
    const providerKeys: ProviderApiKeys = (() => {
        try { return JSON.parse(get("providerApiKeys") || "{}"); } catch { return {}; }
    })();

    const run = await prisma.evalRun.findUnique({
        where: { id: runId },
        include: { suite: { include: { cases: { orderBy: { order: "asc" } } } } },
    });
    if (!run) return;

    const suite = run.suite;
    const tasks: EvalTask[] = [];
    for (const model of run.models) {
        for (const c of suite.cases) {
            tasks.push({ caseId: c.id, prompt: c.prompt, expected: c.expected, model });
        }
    }

    try {
        await mapPool(tasks, CONCURRENCY, async (task) => {
            const messages = [
                ...(suite.systemPrompt ? [{ role: "system" as const, content: suite.systemPrompt }] : []),
                { role: "user" as const, content: task.prompt },
            ];

            const started = Date.now();
            let output = "";
            let error: string | null = null;
            let inputTokens = 0;
            let outputTokens = 0;

            try {
                const result = await generateText({
                    model: createAIModel(task.model, apiKey, providerKeys),
                    messages,
                } as any);
                output = (result.text || "").trim();
                const usage = result.usage as { inputTokens?: number; outputTokens?: number } | undefined;
                inputTokens = usage?.inputTokens ?? 0;
                outputTokens = usage?.outputTokens ?? 0;
            } catch (err) {
                error = String(err).slice(0, 1000);
            }
            const latencyMs = Date.now() - started;

            const passed = task.expected
                ? output.toLowerCase().includes(task.expected.toLowerCase())
                : null;

            let score: number | null = null;
            let rationale: string | null = null;
            if (!error && run.judgeModel && output) {
                try {
                    const verdict = await judgeResponse(
                        run.judgeModel, apiKey, providerKeys, task.prompt, task.expected, output,
                    );
                    score = verdict.score;
                    rationale = verdict.rationale;
                } catch (err) {
                    rationale = "Judge error: " + String(err).slice(0, 200);
                }
            }

            await prisma.evalResult.create({
                data: {
                    runId,
                    caseId: task.caseId,
                    prompt: task.prompt.slice(0, 8000),
                    model: task.model,
                    output: output ? output.slice(0, MAX_OUTPUT_CHARS) : null,
                    score,
                    passed,
                    rationale,
                    inputTokens,
                    outputTokens,
                    latencyMs,
                    error,
                },
            }).catch(() => {});
            await prisma.evalRun.update({
                where: { id: runId },
                data: { doneTasks: { increment: 1 } },
            }).catch(() => {});
        });

        await prisma.evalRun.update({
            where: { id: runId },
            data: { status: "done", completedAt: new Date() },
        });
        logger.info("eval_run_done", { runId, tasks: tasks.length, models: run.models.length });
    } catch (err) {
        logger.error("eval_run_failed", { runId, error: String(err) });
        await prisma.evalRun.update({
            where: { id: runId },
            data: { status: "error", error: String(err).slice(0, 1000), completedAt: new Date() },
        }).catch(() => {});
    }
}
