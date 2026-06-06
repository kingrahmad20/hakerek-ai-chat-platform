// Shared token-cost model and formatting helpers used by the usage analytics
// surfaces (admin dashboard, per-user usage, per-workspace usage).
//
// Prices are rough input/output USD per 1M tokens for common OpenRouter models.
// Unknown models fall back to DEFAULT_PRICE so cost is always an estimate, never
// undefined. Keep this table in sync with provider pricing as it drifts.

export const DEFAULT_PRICE = { input: 1, output: 3 };

export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
    "openai/gpt-4o": { input: 2.5, output: 10 },
    "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
    "openai/gpt-4-turbo": { input: 10, output: 30 },
    "openai/gpt-3.5-turbo": { input: 0.5, output: 1.5 },
    "anthropic/claude-3.5-sonnet": { input: 3, output: 15 },
    "anthropic/claude-3-haiku": { input: 0.25, output: 1.25 },
    "anthropic/claude-3-opus": { input: 15, output: 75 },
    "anthropic/claude-opus-4": { input: 15, output: 75 },
    "anthropic/claude-sonnet-4": { input: 3, output: 15 },
    "anthropic/claude-haiku-4": { input: 0.8, output: 4 },
    "google/gemini-pro": { input: 0.5, output: 1.5 },
    "google/gemini-1.5-flash": { input: 0.075, output: 0.3 },
    "google/gemini-1.5-pro": { input: 1.25, output: 5 },
    "meta-llama/llama-3.1-70b-instruct": { input: 0.52, output: 0.75 },
    "meta-llama/llama-3.1-8b-instruct": { input: 0.055, output: 0.055 },
    "mistralai/mistral-7b-instruct": { input: 0.055, output: 0.055 },
    "openrouter/auto": { input: 1, output: 3 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
    const price = MODEL_PRICES[model] ?? DEFAULT_PRICE;
    return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

/** Trailing segment of a slug-style model id, e.g. "anthropic/claude-sonnet-4" → "claude-sonnet-4". */
export function shortModel(model: string): string {
    const parts = model.split("/");
    return parts[parts.length - 1] ?? model;
}

export function fmtUsd(n: number): string {
    if (n > 0 && n < 0.01) return "< $0.01";
    return "$" + n.toFixed(n < 1 ? 4 : 2);
}

export function fmtTokens(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return String(n);
}
