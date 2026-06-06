import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

// api-auth pulls authOptions from @/lib/auth (which would load NextAuth providers
// and the prisma adapter) and getServerSession from next-auth/next. Mock both,
// plus the prisma singleton, so we test only the token/session resolution logic.
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
    prisma: {
        apiToken: { findUnique: vi.fn(), update: vi.fn() },
    },
}));

import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/api-auth";

const findToken = vi.mocked(prisma.apiToken.findUnique);
const updateToken = vi.mocked(prisma.apiToken.update);
const session = vi.mocked(getServerSession);

function bearer(token: string): Request {
    return new Request("https://app.test/api/x", {
        headers: { authorization: `Bearer ${token}` },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    updateToken.mockResolvedValue({} as never);
});

describe("getAuth — API token path", () => {
    it("hashes the bearer token with SHA-256 to look it up", async () => {
        findToken.mockResolvedValue({
            id: "t1",
            user: { id: "u1", role: "USER", banned: false },
        } as never);

        const auth = await getAuth(bearer("secret-token"));

        expect(auth).toEqual({ id: "u1", role: "USER" });
        const expectedHash = createHash("sha256").update("secret-token").digest("hex");
        expect(findToken).toHaveBeenCalledWith(
            expect.objectContaining({ where: { tokenHash: expectedHash } })
        );
    });

    it("returns null for an unknown token", async () => {
        findToken.mockResolvedValue(null as never);
        expect(await getAuth(bearer("nope"))).toBeNull();
    });

    it("rejects a token belonging to a banned user", async () => {
        findToken.mockResolvedValue({
            id: "t1",
            user: { id: "u1", role: "USER", banned: true },
        } as never);
        expect(await getAuth(bearer("banned"))).toBeNull();
    });

    it("touches lastUsed on a successful token auth", async () => {
        findToken.mockResolvedValue({
            id: "t1",
            user: { id: "u1", role: "ADMIN", banned: false },
        } as never);
        await getAuth(bearer("ok"));
        expect(updateToken).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: "t1" } })
        );
    });

    it("never consults the session when a valid token is present", async () => {
        findToken.mockResolvedValue({
            id: "t1",
            user: { id: "u1", role: "USER", banned: false },
        } as never);
        await getAuth(bearer("ok"));
        expect(session).not.toHaveBeenCalled();
    });
});

describe("getAuth — session path", () => {
    function noHeader(): Request {
        return new Request("https://app.test/api/x");
    }

    it("falls back to the session when there is no bearer header", async () => {
        session.mockResolvedValue({ user: { id: "u9", role: "ADMIN" } } as never);
        expect(await getAuth(noHeader())).toEqual({ id: "u9", role: "ADMIN" });
        expect(findToken).not.toHaveBeenCalled();
    });

    it("returns null when there is no session", async () => {
        session.mockResolvedValue(null as never);
        expect(await getAuth(noHeader())).toBeNull();
    });

    it("returns null when the session lacks a user id", async () => {
        session.mockResolvedValue({ user: { role: "USER" } } as never);
        expect(await getAuth(noHeader())).toBeNull();
    });
});
