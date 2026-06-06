import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

export type ProviderName = "openrouter" | "openai" | "anthropic" | "deepseek" | "qwen";

export interface ProviderModelItem {
    id: string;
    name: string;
    provider: ProviderName;
    free?: boolean;
}

export const PROVIDER_MODELS: Record<Exclude<ProviderName, "openrouter">, ProviderModelItem[]> = {
    openai: [
        { id: "openai:gpt-4o",           name: "GPT-4o",           provider: "openai" },
        { id: "openai:gpt-4o-mini",      name: "GPT-4o Mini",      provider: "openai" },
        { id: "openai:gpt-4-turbo",      name: "GPT-4 Turbo",      provider: "openai" },
        { id: "openai:gpt-3.5-turbo",    name: "GPT-3.5 Turbo",    provider: "openai" },
        { id: "openai:o1",               name: "o1",               provider: "openai" },
        { id: "openai:o1-mini",          name: "o1 Mini",          provider: "openai" },
        { id: "openai:o3",               name: "o3",               provider: "openai" },
        { id: "openai:o3-mini",          name: "o3 Mini",          provider: "openai" },
        { id: "openai:o4-mini",          name: "o4 Mini",          provider: "openai" },
    ],
    anthropic: [
        { id: "anthropic:claude-opus-4-7",              name: "Claude Opus 4.7",      provider: "anthropic" },
        { id: "anthropic:claude-sonnet-4-6",            name: "Claude Sonnet 4.6",    provider: "anthropic" },
        { id: "anthropic:claude-haiku-4-5-20251001",    name: "Claude Haiku 4.5",     provider: "anthropic" },
        { id: "anthropic:claude-3-5-sonnet-20241022",   name: "Claude 3.5 Sonnet",    provider: "anthropic" },
        { id: "anthropic:claude-3-5-haiku-20241022",    name: "Claude 3.5 Haiku",     provider: "anthropic" },
        { id: "anthropic:claude-3-opus-20240229",       name: "Claude 3 Opus",        provider: "anthropic" },
    ],
    deepseek: [
        { id: "deepseek:deepseek-chat",     name: "DeepSeek Chat (V3)",     provider: "deepseek" },
        { id: "deepseek:deepseek-reasoner", name: "DeepSeek Reasoner (R1)", provider: "deepseek" },
    ],
    qwen: [
        { id: "qwen:qwen-max",                  name: "Qwen Max",               provider: "qwen" },
        { id: "qwen:qwen-plus",                 name: "Qwen Plus",              provider: "qwen" },
        { id: "qwen:qwen-turbo",                name: "Qwen Turbo",             provider: "qwen" },
        { id: "qwen:qwen-long",                 name: "Qwen Long",              provider: "qwen" },
        { id: "qwen:qwen2.5-72b-instruct",      name: "Qwen 2.5 72B Instruct",  provider: "qwen" },
        { id: "qwen:qwen2.5-7b-instruct",       name: "Qwen 2.5 7B Instruct",   provider: "qwen", free: true },
    ],
};

export const PROVIDER_LABELS: Record<ProviderName, string> = {
    openrouter: "OpenRouter",
    openai:     "OpenAI",
    anthropic:  "Anthropic",
    deepseek:   "DeepSeek",
    qwen:       "Qwen",
};

export interface ProviderApiKeys {
    openai?:    string;
    anthropic?: string;
    deepseek?:  string;
    qwen?:      string;
    /** Optional custom base URL for OpenAI or any OpenAI-compatible endpoint. */
    openaiBaseUrl?: string;
}

/** Parse "provider:modelId". Models without a colon default to openrouter. */
export function parseModelId(fullId: string): { provider: ProviderName; modelId: string } {
    const colonIdx = fullId.indexOf(":");
    if (colonIdx === -1) return { provider: "openrouter", modelId: fullId };
    const provider = fullId.slice(0, colonIdx) as ProviderName;
    const modelId = fullId.slice(colonIdx + 1);
    const known: ProviderName[] = ["openrouter", "openai", "anthropic", "deepseek", "qwen"];
    if (!known.includes(provider)) return { provider: "openrouter", modelId: fullId };
    return { provider, modelId };
}

export function getProviderForModel(fullId: string): ProviderName {
    return parseModelId(fullId).provider;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAIModel(fullId: string, openrouterKey: string, providerKeys: ProviderApiKeys): any {
    const { provider, modelId } = parseModelId(fullId);

    switch (provider) {
        case "openai": {
            const baseURL = providerKeys.openaiBaseUrl?.trim();
            const client = createOpenAI({
                apiKey: providerKeys.openai ?? "",
                ...(baseURL ? { baseURL } : {}),
            });
            return client.chat(modelId);
        }
        case "anthropic": {
            const client = createAnthropic({ apiKey: providerKeys.anthropic ?? "" });
            return client(modelId);
        }
        case "deepseek": {
            const client = createOpenAI({
                baseURL: "https://api.deepseek.com/v1",
                apiKey: providerKeys.deepseek ?? "",
            });
            return client.chat(modelId);
        }
        case "qwen": {
            const client = createOpenAI({
                baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
                apiKey: providerKeys.qwen ?? "",
            });
            return client.chat(modelId);
        }
        case "openrouter":
        default: {
            const client = createOpenAI({
                baseURL: "https://openrouter.ai/api/v1",
                apiKey: openrouterKey,
            });
            return client.chat(modelId);
        }
    }
}
