/* eslint-disable @typescript-eslint/no-explicit-any */
import { streamText } from "ai";
import { createAIModel } from "@/lib/ai-providers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_MESSAGES = 50;
const MAX_TEXT_LENGTH = 16_000;

function extractText(msg: any): string {
    if (Array.isArray(msg.parts)) {
        const fromParts = msg.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("");
        if (fromParts) return fromParts;
    }
    if (typeof msg.content === "string") return msg.content;
    return "";
}

export async function POST(req: Request) {
    const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";

    let body: any;
    try {
        body = await req.json();
    } catch {
        return new Response("Invalid request body", { status: 400 });
    }

    const { messages } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
        return new Response("messages must be a non-empty array", { status: 400 });
    }
    if (messages.length > MAX_MESSAGES) {
        return new Response(`Maximum ${MAX_MESSAGES} messages per request`, { status: 400 });
    }
    for (const msg of messages) {
        if (!msg || typeof msg !== "object") return new Response("Invalid message", { status: 400 });
        if (!["user", "assistant"].includes(msg.role)) return new Response(`Invalid role: ${msg.role}`, { status: 400 });
        if (extractText(msg).length > MAX_TEXT_LENGTH) {
            return new Response("Message too long", { status: 400 });
        }
    }

    const settings = await prisma.setting.findMany();
    const getSetting = (key: string) => settings.find((s) => s.key === key)?.value;

    if (getSetting("widgetEnabled") !== "true") {
        return new Response("Widget is not enabled", { status: 403 });
    }

    // Rate limit
    const rateLimitPerHour = parseInt(getSetting("widgetRateLimitPerHour") || "20");
    if (rateLimitPerHour > 0 && !await rateLimit(`widget:${ip}`, rateLimitPerHour, 3_600_000)) {
        logger.warn("widget_rate_limited", { ip });
        return new Response("Too many requests. Please try again later.", { status: 429 });
    }

    // Resolve active API key
    let apiKey: string | undefined;
    const apiKeysRaw = getSetting("apiKeys");
    if (apiKeysRaw) {
        try {
            const keys: { key: string; active: boolean }[] = JSON.parse(apiKeysRaw);
            apiKey = keys.find((k) => k.active)?.key;
        } catch { /* fall through */ }
    }
    if (!apiKey) apiKey = getSetting("openRouterApiKey");

    if (!apiKey) {
        logger.warn("widget_chat_no_api_key");
        return new Response("Service not configured", { status: 500 });
    }

    const defaultModel = getSetting("defaultModel") || "openrouter/auto";
    const fallbackModels = getSetting("fallbackModels") || "";

    // Build system messages: AI rules + widget system prompt
    const systemParts: string[] = [];

    const aiRulesRaw = getSetting("aiRules");
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

    const widgetSystemPrompt = getSetting("widgetSystemPrompt");
    if (widgetSystemPrompt) systemParts.push(widgetSystemPrompt);

    const messagesForLLM: any[] = messages.map((msg: any) => ({
        role: msg.role,
        content: typeof msg.content === "string" ? msg.content : extractText(msg),
    }));

    if (systemParts.length > 0) {
        messagesForLLM.unshift({ role: "system", content: systemParts.join("\n\n") });
    }

    const providerApiKeys = (() => {
        try { return JSON.parse(getSetting("providerApiKeys") || "{}"); } catch { return {}; }
    })();

    const modelsToTry = [
        defaultModel,
        ...fallbackModels.split(",").filter((m: string) => m.trim() && m.trim() !== defaultModel),
    ];

    const encoder = new TextEncoder();
    const bodyStream = new ReadableStream({
        async start(controller) {
            for (const model of modelsToTry) {
                const trimmedModel = model.trim();
                let sentAnyChunk = false;
                let inputTokens = 0;
                let outputTokens = 0;

                try {
                    const result = streamText({
                        model: createAIModel(trimmedModel, apiKey!, providerApiKeys),
                        messages: messagesForLLM,
                    });

                    for await (const part of result.fullStream) {
                        if (part.type === "text-delta") {
                            sentAnyChunk = true;
                            controller.enqueue(encoder.encode(part.text));
                        } else if (part.type === "finish") {
                            inputTokens = part.totalUsage?.inputTokens ?? 0;
                            outputTokens = part.totalUsage?.outputTokens ?? 0;
                        } else if (part.type === "error") {
                            throw part.error instanceof Error ? part.error : new Error(String(part.error));
                        }
                    }

                    logger.info("widget_chat_completion", { ip, model: trimmedModel, inputTokens, outputTokens });
                    controller.close();
                    return;
                } catch (error) {
                    logger.error("widget_chat_model_error", { model: trimmedModel, error: String(error) });
                    if (sentAnyChunk) break;
                }
            }

            controller.enqueue(encoder.encode("Service temporarily unavailable. Please try again."));
            controller.close();
        },
    });

    return new Response(bodyStream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
