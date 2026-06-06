import { describe, it, expect, vi } from "vitest";

// chunkText is pure, but rag.ts imports the prisma singleton and logger at module
// load. Mock them so importing the module has no side effects and needs no DB.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { chunkText } from "@/lib/rag";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

describe("chunkText", () => {
    it("returns a single chunk for short-but-substantial text", () => {
        const text = "a".repeat(200);
        const chunks = chunkText(text);
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toHaveLength(200);
    });

    it("drops chunks of 50 chars or fewer", () => {
        expect(chunkText("short")).toEqual([]);
        expect(chunkText("a".repeat(50))).toEqual([]);
        expect(chunkText("a".repeat(51))).toHaveLength(1);
    });

    it("splits long text into overlapping windows", () => {
        const text = "a".repeat(2500);
        const chunks = chunkText(text);
        // stride = CHUNK_SIZE - CHUNK_OVERLAP = 800; starts at 0, 800, 1600, 2400
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks[0]).toHaveLength(CHUNK_SIZE);
    });

    it("produces windows that overlap by the configured amount", () => {
        // Use a recognizable sequence to verify overlap between consecutive chunks.
        const text = Array.from({ length: 2000 }, (_, i) => String(i % 10)).join("");
        const chunks = chunkText(text);
        const stride = CHUNK_SIZE - CHUNK_OVERLAP;
        // The tail of chunk 0 should reappear at the head of chunk 1.
        const tailOfFirst = chunks[0].slice(stride);
        expect(chunks[1].startsWith(tailOfFirst)).toBe(true);
        expect(tailOfFirst).toHaveLength(CHUNK_OVERLAP);
    });

    it("normalizes CRLF and collapses excessive blank lines", () => {
        const text = "line one\r\n\r\n\r\n\r\nline two" + "x".repeat(60);
        const chunks = chunkText(text);
        expect(chunks[0]).not.toContain("\r");
        expect(chunks[0]).not.toMatch(/\n{3,}/);
    });

    it("returns nothing for empty or whitespace-only input", () => {
        expect(chunkText("")).toEqual([]);
        expect(chunkText("   \n\n   ")).toEqual([]);
    });
});
