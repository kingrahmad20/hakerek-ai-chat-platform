import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/prisma", () => ({
    prisma: {
        knowledgeBase: { findFirst: vi.fn(), findUnique: vi.fn() },
        knowledgeChunk: { count: vi.fn() },
        userLibraryItem: { findFirst: vi.fn(), create: vi.fn() },
        marketplaceItem: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
        workspaceMember: { findFirst: vi.fn() },
        setting: { findUnique: vi.fn() },
    },
}));

import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { POST as publish } from "@/app/api/marketplace/publish/route";
import { POST as importItem } from "@/app/api/marketplace/[token]/import/route";

const session = vi.mocked(getServerSession);
const kbFindFirst = vi.mocked(prisma.knowledgeBase.findFirst);
const libFindFirst = vi.mocked(prisma.userLibraryItem.findFirst);
const libCreate = vi.mocked(prisma.userLibraryItem.create);
const mpFindUnique = vi.mocked(prisma.marketplaceItem.findUnique);
const mpUpdate = vi.mocked(prisma.marketplaceItem.update);

function jsonReq(body: unknown) {
    return new Request("http://test/api", { method: "POST", body: JSON.stringify(body) });
}
const params = (token: string) => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
    vi.clearAllMocks();
    session.mockResolvedValue({ user: { id: "u1", role: "USER" } } as never);
});

describe("POST /api/marketplace/publish — ownership", () => {
    it("rejects publishing a knowledge base the caller does not own (404)", async () => {
        kbFindFirst.mockResolvedValue(null as never);
        const res = await publish(jsonReq({ type: "knowledge_base", sourceId: "kbX", visibility: "public" }));
        expect(res.status).toBe(404);
        expect(prisma.marketplaceItem.create).not.toHaveBeenCalled();
    });

    it("rejects publishing a persona that is not in the caller's library (non-admin, 404)", async () => {
        libFindFirst.mockResolvedValue(null as never); // not in library
        const res = await publish(jsonReq({ type: "persona", sourceId: "pX", visibility: "public" }));
        expect(res.status).toBe(404);
        expect(prisma.marketplaceItem.create).not.toHaveBeenCalled();
    });

    it("requires workspace membership for workspace visibility (403)", async () => {
        vi.mocked(prisma.workspaceMember.findFirst).mockResolvedValue(null as never);
        const res = await publish(jsonReq({ type: "persona", sourceId: "p1", visibility: "workspace", workspaceId: "w1" }));
        expect(res.status).toBe(403);
    });
});

describe("POST /api/marketplace/[token]/import — idempotency", () => {
    const personaListing = {
        id: "item1", shareToken: "tok", type: "persona", visibility: "public",
        workspaceId: null, authorId: "author", knowledgeBaseId: null,
        name: "Helper", description: null, payload: JSON.stringify({ name: "Helper", systemPrompt: "be helpful" }),
    };

    it("does not create a duplicate when already imported", async () => {
        mpFindUnique.mockResolvedValue(personaListing as never);
        libFindFirst.mockResolvedValue({ id: "existing" } as never); // already imported
        const res = await importItem(new Request("http://test", { method: "POST" }), params("tok"));
        const body = await res.json();
        expect(body.already).toBe(true);
        expect(libCreate).not.toHaveBeenCalled();
    });

    it("creates a library item and bumps installCount on first import", async () => {
        mpFindUnique.mockResolvedValue(personaListing as never);
        libFindFirst.mockResolvedValue(null as never); // not yet imported
        libCreate.mockResolvedValue({ id: "newlib" } as never);
        mpUpdate.mockResolvedValue({} as never);
        const res = await importItem(new Request("http://test", { method: "POST" }), params("tok"));
        expect(res.status).toBe(201);
        expect(libCreate).toHaveBeenCalledOnce();
        expect(libCreate.mock.calls[0][0].data).toMatchObject({ userId: "u1", type: "persona", sourceItemId: "item1" });
        expect(mpUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { installCount: { increment: 1 } } }));
    });
});
