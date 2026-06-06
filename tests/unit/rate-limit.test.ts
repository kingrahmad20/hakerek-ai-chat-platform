import { describe, it, expect, vi, beforeEach } from "vitest";

// rateLimit runs inside prisma.$transaction. Mock the singleton so the
// transaction callback receives a stub `tx` whose rateLimit table we control.
const tx = {
    rateLimit: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
    },
};

vi.mock("@/lib/prisma", () => ({
    prisma: {
        $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    },
}));

import { rateLimit } from "@/lib/rate-limit";

beforeEach(() => {
    vi.clearAllMocks();
});

describe("rateLimit", () => {
    it("allows and creates a window on first hit", async () => {
        tx.rateLimit.findUnique.mockResolvedValue(null);
        const allowed = await rateLimit("user:1", 5, 60_000);
        expect(allowed).toBe(true);
        expect(tx.rateLimit.upsert).toHaveBeenCalledOnce();
        expect(tx.rateLimit.update).not.toHaveBeenCalled();
    });

    it("resets and allows when the existing window has expired", async () => {
        tx.rateLimit.findUnique.mockResolvedValue({
            key: "user:1",
            count: 99,
            resetAt: new Date(Date.now() - 1_000), // already passed
        });
        const allowed = await rateLimit("user:1", 5, 60_000);
        expect(allowed).toBe(true);
        // Reset goes through upsert (count back to 1), not increment.
        expect(tx.rateLimit.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ update: expect.objectContaining({ count: 1 }) })
        );
        expect(tx.rateLimit.update).not.toHaveBeenCalled();
    });

    it("increments and allows while under the limit", async () => {
        tx.rateLimit.findUnique.mockResolvedValue({
            key: "user:1",
            count: 2,
            resetAt: new Date(Date.now() + 60_000),
        });
        const allowed = await rateLimit("user:1", 5, 60_000);
        expect(allowed).toBe(true);
        expect(tx.rateLimit.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { count: { increment: 1 } } })
        );
    });

    it("blocks once the count reaches the limit", async () => {
        tx.rateLimit.findUnique.mockResolvedValue({
            key: "user:1",
            count: 5,
            resetAt: new Date(Date.now() + 60_000),
        });
        const allowed = await rateLimit("user:1", 5, 60_000);
        expect(allowed).toBe(false);
        expect(tx.rateLimit.update).not.toHaveBeenCalled();
        expect(tx.rateLimit.upsert).not.toHaveBeenCalled();
    });

    it("treats the limit as inclusive (count == max blocks)", async () => {
        tx.rateLimit.findUnique.mockResolvedValue({
            key: "user:1",
            count: 5,
            resetAt: new Date(Date.now() + 60_000),
        });
        expect(await rateLimit("user:1", 5, 60_000)).toBe(false);
    });
});
