import { describe, it, expect } from "vitest";
import {
    estimateCostUsd,
    shortModel,
    fmtUsd,
    fmtTokens,
    MODEL_PRICES,
    DEFAULT_PRICE,
} from "@/lib/pricing";

describe("estimateCostUsd", () => {
    it("computes cost from a known model's input/output prices", () => {
        // gpt-4o: input 2.5, output 10 per 1M tokens
        const cost = estimateCostUsd("openai/gpt-4o", 1_000_000, 1_000_000);
        expect(cost).toBeCloseTo(12.5, 6);
    });

    it("scales linearly with token counts", () => {
        const cost = estimateCostUsd("openai/gpt-4o-mini", 500_000, 250_000);
        // 0.5*0.15 + 0.25*0.6 = 0.075 + 0.15 = 0.225
        expect(cost).toBeCloseTo(0.225, 6);
    });

    it("falls back to DEFAULT_PRICE for unknown models", () => {
        const cost = estimateCostUsd("some/unknown-model", 1_000_000, 1_000_000);
        expect(cost).toBeCloseTo(DEFAULT_PRICE.input + DEFAULT_PRICE.output, 6);
    });

    it("returns 0 for zero tokens", () => {
        expect(estimateCostUsd("openai/gpt-4o", 0, 0)).toBe(0);
    });

    it("keeps the price table internally consistent", () => {
        for (const [model, price] of Object.entries(MODEL_PRICES)) {
            expect(price.input, model).toBeGreaterThanOrEqual(0);
            expect(price.output, model).toBeGreaterThanOrEqual(0);
        }
    });
});

describe("shortModel", () => {
    it("returns the trailing slug segment", () => {
        expect(shortModel("anthropic/claude-sonnet-4")).toBe("claude-sonnet-4");
    });

    it("returns the input unchanged when there is no slash", () => {
        expect(shortModel("gpt-4o")).toBe("gpt-4o");
    });

    it("handles a trailing slash", () => {
        expect(shortModel("vendor/")).toBe("");
    });
});

describe("fmtUsd", () => {
    it("renders the small-but-nonzero sentinel", () => {
        expect(fmtUsd(0.0001)).toBe("< $0.01");
    });

    it("uses 4 decimals below $1", () => {
        expect(fmtUsd(0.5)).toBe("$0.5000");
    });

    it("uses 2 decimals at or above $1", () => {
        expect(fmtUsd(12.345)).toBe("$12.35");
    });

    it("renders exact zero without the sentinel", () => {
        expect(fmtUsd(0)).toBe("$0.0000");
    });
});

describe("fmtTokens", () => {
    it("renders millions", () => {
        expect(fmtTokens(2_500_000)).toBe("2.5M");
    });

    it("renders thousands", () => {
        expect(fmtTokens(1_500)).toBe("1.5K");
    });

    it("renders small counts verbatim", () => {
        expect(fmtTokens(999)).toBe("999");
    });
});
