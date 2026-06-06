import { describe, it, expect } from "vitest";

// The module imports the prisma singleton at top level (used by
// buildFeedbackRecords). Mock it so importing the pure serializers doesn't pull
// in a real PrismaClient — these tests only exercise the in-memory transforms.
import { vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
    buildPreferencePairs,
    datasetStats,
    serializeSft,
    serializeDpo,
    serializeEval,
    serializeCsv,
    type FeedbackRecord,
} from "@/lib/feedback-dataset";

function rec(over: Partial<FeedbackRecord>): FeedbackRecord {
    return {
        messageId: "m1",
        chatId: "c1",
        model: "gpt-test",
        upvotes: 1,
        downvotes: 0,
        net: 1,
        label: "good",
        messages: [
            { role: "user", content: "hi" },
            { role: "assistant", content: "hello" },
        ],
        prompt: "hi",
        completion: "hello",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...over,
    };
}

describe("datasetStats", () => {
    it("counts good, bad and total", () => {
        const records = [
            rec({ label: "good" }),
            rec({ label: "bad", net: -1, upvotes: 0, downvotes: 1 }),
            rec({ label: "good" }),
        ];
        const s = datasetStats(records);
        expect(s.total).toBe(3);
        expect(s.good).toBe(2);
        expect(s.bad).toBe(1);
    });
});

describe("buildPreferencePairs", () => {
    it("pairs a good and bad answer to the same prompt", () => {
        const records = [
            rec({ messageId: "g", prompt: "what is 2+2", completion: "4", label: "good", net: 2 }),
            rec({ messageId: "b", prompt: "what is 2+2", completion: "5", label: "bad", net: -1 }),
        ];
        const pairs = buildPreferencePairs(records);
        expect(pairs).toHaveLength(1);
        expect(pairs[0].preferred).toBe("4");
        expect(pairs[0].rejected).toBe("5");
        // input is the shared context with the final assistant turn dropped
        expect(pairs[0].input.at(-1)?.role).toBe("user");
    });

    it("ignores prompts that only have one polarity", () => {
        const records = [
            rec({ prompt: "solo", label: "good" }),
            rec({ prompt: "another", label: "good" }),
        ];
        expect(buildPreferencePairs(records)).toHaveLength(0);
    });

    it("matches prompts case-insensitively and picks the strongest votes", () => {
        const records = [
            rec({ messageId: "g1", prompt: "Hello", completion: "ok", label: "good", net: 1 }),
            rec({ messageId: "g2", prompt: "hello", completion: "best", label: "good", net: 5 }),
            rec({ messageId: "b1", prompt: "HELLO", completion: "bad", label: "bad", net: -3 }),
        ];
        const pairs = buildPreferencePairs(records);
        expect(pairs).toHaveLength(1);
        expect(pairs[0].preferred).toBe("best"); // highest net good
        expect(pairs[0].rejected).toBe("bad");
    });
});

describe("serializeSft", () => {
    it("emits one chat object per line, filtered by label", () => {
        const records = [
            rec({ label: "good", messages: [{ role: "user", content: "q" }, { role: "assistant", content: "a" }] }),
            rec({ label: "bad" }),
        ];
        const out = serializeSft(records, "good");
        const lines = out.split("\n");
        expect(lines).toHaveLength(1);
        expect(JSON.parse(lines[0])).toEqual({ messages: [{ role: "user", content: "q" }, { role: "assistant", content: "a" }] });
    });
});

describe("serializeDpo", () => {
    it("emits OpenAI preference format", () => {
        const records = [
            rec({ prompt: "p", completion: "good", label: "good", net: 1 }),
            rec({ prompt: "p", completion: "bad", label: "bad", net: -1 }),
        ];
        const line = serializeDpo(records).split("\n")[0];
        const obj = JSON.parse(line);
        expect(obj.preferred_output).toEqual([{ role: "assistant", content: "good" }]);
        expect(obj.non_preferred_output).toEqual([{ role: "assistant", content: "bad" }]);
        expect(obj.input.messages).toBeInstanceOf(Array);
    });
});

describe("serializeEval", () => {
    it("includes label and vote metadata, context excludes the completion", () => {
        const out = serializeEval([rec({ upvotes: 3, downvotes: 1 })], "all");
        const obj = JSON.parse(out);
        expect(obj.label).toBe("good");
        expect(obj.upvotes).toBe(3);
        expect(obj.completion).toBe("hello");
        expect(obj.messages.some((m: { role: string }) => m.role === "assistant")).toBe(false);
    });
});

describe("serializeCsv", () => {
    it("writes a header and escapes commas / quotes / newlines", () => {
        const out = serializeCsv([rec({ prompt: 'a,"b"\nc', completion: "x" })], "all");
        const lines = out.split("\r\n");
        expect(lines[0]).toBe("label,prompt,completion,model,upvotes,downvotes,net,messageId,chatId,createdAt");
        expect(lines[1]).toContain('"a,""b""\nc"');
    });
});
