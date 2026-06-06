/* eslint-disable @typescript-eslint/no-explicit-any */
import { generateText } from "ai";
import type { ScheduledAgent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createAIModel, type ProviderApiKeys } from "@/lib/ai-providers";
import { buildTools, type ToolName, type SearchProvider } from "@/lib/agent-tools";
import { getUserMemoriesForPrompt } from "@/lib/memory";
import { embedAndSaveMessage } from "@/lib/rag";
import { createNotification } from "@/lib/notifications";
import { dispatchWebhook } from "@/lib/webhook";
import { getNextRun } from "@/lib/cron";

const MAX_RESULT_CHARS = 8_000;
const RUN_BATCH = 50;

type SettingMap = Map<string, string>;

async function loadSettings(): Promise<SettingMap> {
    const settings = await prisma.setting.findMany();
    return new Map(settings.map((s) => [s.key, s.value]));
}

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

export interface RunResult {
    status: "success" | "error";
    output?: string;
    error?: string;
    inputTokens: number;
    outputTokens: number;
    model?: string;
}

/**
 * Execute a single scheduled agent's prompt against the configured AI provider
 * and return the result. This does NOT persist run records or deliver outputs —
 * see {@link runAndRecord} for the full lifecycle.
 */
export async function executeAgent(agent: ScheduledAgent, settings: SettingMap): Promise<RunResult> {
    const get = (k: string) => settings.get(k);

    const apiKey = resolveApiKey(get);
    const providerApiKeys: ProviderApiKeys = (() => {
        try { return JSON.parse(get("providerApiKeys") || "{}"); } catch { return {}; }
    })();

    const defaultModel = get("defaultModel") || "openrouter/auto";
    const primaryModel = agent.model?.trim() || defaultModel;
    const fallbackModels = (get("fallbackModels") || "")
        .split(",")
        .map((m) => m.trim())
        .filter((m) => m && m !== primaryModel);

    // Build system prompt: global AI rules + the user's personal system prompt +
    // long-term memories. Mirrors the assembly in /api/chat so scheduled runs
    // behave like a normal conversation turn for this user.
    const systemParts: string[] = [
        "You are running as an automated scheduled agent. Produce a self-contained " +
        "response suitable for delivery as a notification or digest — the user is not " +
        "present to answer follow-up questions.",
    ];

    const aiRulesRaw = get("aiRules");
    if (aiRulesRaw) {
        try {
            const rules: { title: string; content: string; enabled: boolean }[] = JSON.parse(aiRulesRaw);
            const active = rules.filter((r) => r.enabled);
            if (active.length > 0) {
                systemParts.push(
                    "Follow these rules before responding to any question:\n" +
                    active.map((r, i) => `${i + 1}. [${r.title}] ${r.content}`).join("\n")
                );
            }
        } catch { /* ignore */ }
    }

    const dbUser = await prisma.user.findUnique({
        where: { id: agent.userId },
        select: { systemPrompt: true },
    }).catch(() => null);
    if (dbUser?.systemPrompt) systemParts.push(dbUser.systemPrompt);

    const memoriesBlock = await getUserMemoriesForPrompt(agent.userId).catch(() => "");
    if (memoriesBlock) systemParts.push(memoriesBlock);

    // Tools — intersect the agent's requested tools with the globally allowed set.
    const toolsEnabled = get("toolsEnabled") === "true";
    const allowedTools = (get("toolAllowedList") || "web_search,calculator,datetime,url_fetch,generate_image")
        .split(",")
        .filter(Boolean) as ToolName[];
    const requestedTools = (agent.enabledTools || []).filter((t): t is ToolName =>
        allowedTools.includes(t as ToolName)
    );

    const generatedImages: { dataUrl: string; revisedPrompt: string }[] = [];
    const activeTools =
        toolsEnabled && requestedTools.length > 0
            ? buildTools(requestedTools, {
                  searchApiKey: get("toolSearchApiKey") || "",
                  searchProvider: (get("toolSearchProvider") || "serper") as SearchProvider,
                  allowedTools,
                  imageApiKey: apiKey,
                  imageModel: get("imageGenerationModel") || undefined,
                  onImageGenerated: (img) => generatedImages.push(img),
              })
            : {};
    const hasTools = Object.keys(activeTools).length > 0;

    const messages = [
        ...(systemParts.length > 0 ? [{ role: "system" as const, content: systemParts.join("\n\n") }] : []),
        { role: "user" as const, content: agent.prompt },
    ];

    const modelsToTry = [primaryModel, ...fallbackModels];
    let lastError = "Unknown error";

    for (const model of modelsToTry) {
        try {
            const result = await generateText({
                model: createAIModel(model, apiKey ?? "", providerApiKeys),
                messages,
                ...(hasTools ? { tools: activeTools, maxSteps: 8 } : {}),
            } as any);

            let output = (result.text || "").trim();
            for (const img of generatedImages) {
                const alt = img.revisedPrompt.replace(/[\[\]\r\n]+/g, " ").trim();
                output += `\n\n![${alt}](${img.dataUrl})`;
            }

            const usage = result.usage as { inputTokens?: number; outputTokens?: number } | undefined;
            return {
                status: "success",
                output: output || "(empty response)",
                inputTokens: usage?.inputTokens ?? 0,
                outputTokens: usage?.outputTokens ?? 0,
                model,
            };
        } catch (err) {
            lastError = String(err);
            logger.warn("scheduled_agent_model_error", { agentId: agent.id, model, error: lastError });
        }
    }

    return { status: "error", error: lastError, inputTokens: 0, outputTokens: 0 };
}

/** Append a run's output to the agent's dedicated chat, creating it on first use. */
async function deliverToChat(agent: ScheduledAgent, output: string, apiKey: string): Promise<string | null> {
    let chatId = agent.chatId;
    try {
        if (!chatId) {
            const chat = await prisma.chat.create({
                data: { userId: agent.userId, title: `🕒 ${agent.name}`.slice(0, 60) },
                select: { id: true },
            });
            chatId = chat.id;
        }
        const [userMsg, assistantMsg] = await prisma.$transaction([
            prisma.message.create({ data: { chatId, role: "user", content: agent.prompt } }),
            prisma.message.create({ data: { chatId, role: "assistant", content: output } }),
            prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } }),
        ]);
        embedAndSaveMessage(userMsg.id, agent.prompt, apiKey).catch(() => {});
        embedAndSaveMessage(assistantMsg.id, output, apiKey).catch(() => {});
        return chatId;
    } catch (err) {
        logger.warn("scheduled_agent_chat_delivery_failed", { agentId: agent.id, error: String(err) });
        return chatId ?? null;
    }
}

/**
 * Run an agent, persist a run record, deliver outputs (notification / chat /
 * webhook), and reschedule `nextRunAt`. Safe to call ad-hoc ("run now") or from
 * the cron sweep.
 */
export async function runAndRecord(agent: ScheduledAgent, settings?: SettingMap): Promise<RunResult> {
    const cfg = settings ?? (await loadSettings());
    const startedAt = Date.now();
    const result = await executeAgent(agent, cfg);
    const durationMs = Date.now() - startedAt;

    await prisma.scheduledAgentRun.create({
        data: {
            agentId: agent.id,
            status: result.status,
            output: result.output ? result.output.slice(0, MAX_RESULT_CHARS) : null,
            error: result.error ?? null,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            durationMs,
        },
    }).catch(() => {});

    let chatId = agent.chatId;
    if (result.status === "success" && agent.saveToChat && result.output) {
        const apiKey = resolveApiKey((k) => cfg.get(k)) ?? "";
        chatId = await deliverToChat(agent, result.output, apiKey);
    }

    // Reschedule from "now" so a missed window doesn't fire repeatedly.
    const nextRunAt = agent.active ? getNextRun(agent.schedule, agent.timezone, new Date()) : null;

    await prisma.scheduledAgent.update({
        where: { id: agent.id },
        data: {
            lastRunAt: new Date(),
            lastStatus: result.status,
            lastError: result.error ?? null,
            lastResult: result.output ? result.output.slice(0, MAX_RESULT_CHARS) : null,
            runCount: { increment: 1 },
            nextRunAt,
            ...(chatId && chatId !== agent.chatId ? { chatId } : {}),
        },
    }).catch(() => {});

    if (agent.notify) {
        if (result.status === "success") {
            const preview = (result.output || "").replace(/\s+/g, " ").slice(0, 280);
            await createNotification({
                userId: agent.userId,
                type: "scheduled_agent",
                title: `🕒 ${agent.name}`,
                body: preview,
                link: "/",
                refId: agent.id,
            });
        } else {
            await createNotification({
                userId: agent.userId,
                type: "scheduled_agent",
                title: `⚠️ ${agent.name} failed`,
                body: (result.error || "").slice(0, 280),
                refId: agent.id,
            });
        }
    }

    dispatchWebhook(agent.userId, "scheduled_agent.completed", {
        agentId: agent.id,
        name: agent.name,
        status: result.status,
        output: result.output ?? null,
        error: result.error ?? null,
        chatId: chatId ?? null,
        runAt: new Date().toISOString(),
    }).catch(() => {});

    logger.info("scheduled_agent_run", {
        agentId: agent.id,
        userId: agent.userId,
        status: result.status,
        model: result.model,
        durationMs,
    });

    return result;
}

/** Cron sweep: run every active agent whose nextRunAt is due. */
export async function processDueScheduledAgents(): Promise<{ processed: number; succeeded: number }> {
    const now = new Date();
    const due = await prisma.scheduledAgent.findMany({
        where: { active: true, nextRunAt: { not: null, lte: now } },
        orderBy: { nextRunAt: "asc" },
        take: RUN_BATCH,
    });

    if (due.length === 0) return { processed: 0, succeeded: 0 };

    const settings = await loadSettings();
    let succeeded = 0;

    const results = await Promise.allSettled(
        due.map((agent) => runAndRecord(agent, settings))
    );
    for (const r of results) {
        if (r.status === "fulfilled" && r.value.status === "success") succeeded++;
    }

    return { processed: due.length, succeeded };
}
