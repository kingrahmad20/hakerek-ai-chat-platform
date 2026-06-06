import { tool } from "ai";
import { z } from "zod";
import { safeFetch, SsrfError } from "@/lib/ssrf";
import { generateImage, DEFAULT_IMAGE_MODEL } from "@/lib/image-gen";

export type ToolName = "web_search" | "calculator" | "datetime" | "url_fetch" | "generate_image";

export const TOOL_LABELS: Record<ToolName, string> = {
    web_search: "Web Search",
    calculator: "Calculator",
    datetime: "Date & Time",
    url_fetch: "Fetch URL",
    generate_image: "Generate Image",
};

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
    web_search: "Search the web for current information",
    calculator: "Evaluate mathematical expressions",
    datetime: "Get the current date and time",
    url_fetch: "Fetch and read the content of a URL",
    generate_image: "Generate an image from a text description",
};

export type SearchProvider = "serper" | "brave" | "tavily";

export interface ToolConfig {
    searchProvider: SearchProvider;
    searchApiKey: string;
    allowedTools: ToolName[];
    /** API key (OpenRouter) used by the generate_image tool. */
    imageApiKey?: string;
    /** Image-generation model id; falls back to the provider default. */
    imageModel?: string;
    /**
     * Side-channel sink for generated images. The tool itself returns only a short
     * text to the model (returning the multi-megabyte base64 data URL to the LLM
     * would blow the context window), so the caller receives the actual image here
     * and is responsible for surfacing it to the user.
     */
    onImageGenerated?: (image: { dataUrl: string; revisedPrompt: string }) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildTools(requestedTools: ToolName[], config: ToolConfig): Record<string, any> {
    const allowed = new Set(config.allowedTools);
    const active = requestedTools.filter((t) => allowed.has(t));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: Record<string, any> = {};

    if (active.includes("web_search") && config.searchApiKey) {
        tools.web_search = tool({
            description:
                "Search the web for current information, news, or facts. Use when you need up-to-date or real-time information.",
            inputSchema: z.object({
                query: z.string().describe("The search query to look up"),
            }),
            execute: async ({ query }) =>
                searchWeb(query, config.searchApiKey, config.searchProvider),
        });
    }

    if (active.includes("calculator")) {
        tools.calculator = tool({
            description:
                "Evaluate mathematical expressions. Use for arithmetic, algebra, and common math functions.",
            inputSchema: z.object({
                expression: z
                    .string()
                    .describe(
                        "A mathematical expression, e.g. '2 * (3 + 4)', 'sqrt(144)', 'pi * 5^2'"
                    ),
            }),
            execute: async ({ expression }) => evaluateMath(expression),
        });
    }

    if (active.includes("datetime")) {
        tools.datetime = tool({
            description:
                "Get the current date and time, optionally in a specific timezone.",
            inputSchema: z.object({
                timezone: z
                    .string()
                    .optional()
                    .describe("IANA timezone, e.g. 'America/New_York', 'Asia/Jakarta'"),
            }),
            execute: async ({ timezone }) => {
                try {
                    const opts: Intl.DateTimeFormatOptions = {
                        dateStyle: "full",
                        timeStyle: "long",
                        timeZone: timezone || "UTC",
                    };
                    return {
                        datetime: new Date().toLocaleString("en-US", opts),
                        iso: new Date().toISOString(),
                        timezone: timezone || "UTC",
                    };
                } catch {
                    return { datetime: new Date().toISOString(), timezone: "UTC" };
                }
            },
        });
    }

    if (active.includes("url_fetch")) {
        tools.url_fetch = tool({
            description:
                "Fetch and read the text content of a web page or URL. Use to retrieve specific page content.",
            inputSchema: z.object({
                url: z.string().url().describe("The full URL to fetch"),
            }),
            execute: async ({ url }) => fetchUrl(url),
        });
    }

    if (active.includes("generate_image") && config.imageApiKey) {
        tools.generate_image = tool({
            description:
                "Generate an image from a text description. Use when the user asks you to create, draw, " +
                "make, or illustrate a picture. The generated image is shown to the user automatically — " +
                "do not attempt to describe or reproduce the image data yourself.",
            inputSchema: z.object({
                prompt: z
                    .string()
                    .describe("A detailed description of the image to generate"),
            }),
            execute: async ({ prompt }) => {
                try {
                    const result = await generateImage(
                        prompt,
                        config.imageApiKey!,
                        config.imageModel || DEFAULT_IMAGE_MODEL
                    );
                    if (!result.ok) {
                        return { error: `Image generation failed (${result.status})` };
                    }
                    config.onImageGenerated?.({
                        dataUrl: result.dataUrl,
                        revisedPrompt: result.revisedPrompt,
                    });
                    // Deliberately omit the data URL: the image is delivered to the
                    // user out-of-band via onImageGenerated. Returning the base64 here
                    // would flood the model context.
                    return {
                        success: true,
                        revisedPrompt: result.revisedPrompt,
                        note: "The generated image has been displayed to the user.",
                    };
                } catch (err) {
                    return { error: String(err) };
                }
            },
        });
    }

    return tools;
}

async function searchWeb(
    query: string,
    apiKey: string,
    provider: SearchProvider
): Promise<Record<string, unknown>> {
    try {
        if (provider === "serper") {
            const res = await fetch("https://google.serper.dev/search", {
                method: "POST",
                headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
                body: JSON.stringify({ q: query, num: 5 }),
                signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) return { error: `Search API error: ${res.status}` };
            const data = await res.json();
            const results = (data.organic || []).slice(0, 5).map((r: Record<string, string>) => ({
                title: r.title,
                url: r.link,
                snippet: r.snippet,
            }));
            const answerBox = data.answerBox
                ? { answer: data.answerBox.answer || data.answerBox.snippet }
                : {};
            return { query, results, ...answerBox };
        }

        if (provider === "brave") {
            const res = await fetch(
                `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
                {
                    headers: {
                        Accept: "application/json",
                        "X-Subscription-Token": apiKey,
                    },
                    signal: AbortSignal.timeout(10_000),
                }
            );
            if (!res.ok) return { error: `Search API error: ${res.status}` };
            const data = await res.json();
            const results = (data.web?.results || []).slice(0, 5).map((r: Record<string, string>) => ({
                title: r.title,
                url: r.url,
                snippet: r.description,
            }));
            return { query, results };
        }

        if (provider === "tavily") {
            const res = await fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
                signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) return { error: `Search API error: ${res.status}` };
            const data = await res.json();
            const results = (data.results || []).slice(0, 5).map((r: Record<string, string>) => ({
                title: r.title,
                url: r.url,
                snippet: (r.content || "").slice(0, 300),
            }));
            return { query, results, answer: data.answer };
        }

        return { error: "Unknown search provider" };
    } catch (err) {
        return { error: String(err) };
    }
}

function evaluateMath(expression: string): Record<string, unknown> {
    if (!expression.trim()) return { error: "Empty expression" };
    const stripped = expression.replace(
        /\b(sqrt|abs|floor|ceil|round|pow|log|sin|cos|tan|pi|e)\b/g,
        ""
    );
    if (/[^0-9+\-*/().,%^!\s]/.test(stripped)) {
        return { error: "Expression contains disallowed characters" };
    }
    try {
        const mathFns = {
            sqrt: Math.sqrt,
            abs: Math.abs,
            floor: Math.floor,
            ceil: Math.ceil,
            round: Math.round,
            pow: Math.pow,
            log: Math.log,
            sin: Math.sin,
            cos: Math.cos,
            tan: Math.tan,
            pi: Math.PI,
            e: Math.E,
        };
        const fn = new Function(
            ...Object.keys(mathFns),
            `"use strict"; return (${expression});`
        );
        const result = fn(...Object.values(mathFns)) as unknown;
        if (typeof result !== "number" || !isFinite(result))
            return { error: "Result is not a finite number" };
        return { expression, result };
    } catch {
        return { error: "Failed to evaluate expression" };
    }
}

async function fetchUrl(url: string): Promise<Record<string, unknown>> {
    try {
        // safeFetch validates the host (and every redirect hop) against
        // private/internal ranges before connecting, preventing SSRF.
        const res = await safeFetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; HakerekBot/1.0)" },
        });
        if (!res.ok) return { error: `HTTP ${res.status}: ${res.statusText}` };

        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("text") && !ct.includes("json")) {
            return { error: "Non-text content type: " + ct };
        }

        let text = await res.text();
        text = text
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 4_000);

        return { url, content: text };
    } catch (err) {
        if (err instanceof SsrfError) return { error: err.message };
        return { error: String(err) };
    }
}
