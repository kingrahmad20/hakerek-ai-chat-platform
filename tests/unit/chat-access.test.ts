import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the prisma singleton so the ownership-branching logic can be exercised
// without a database. Each test stubs only the queries it needs.
vi.mock("@/lib/prisma", () => ({
    prisma: {
        chat: { findFirst: vi.fn() },
        workspaceFolder: { findUnique: vi.fn() },
        workspaceMember: { findUnique: vi.fn(), findMany: vi.fn() },
    },
}));

import { prisma } from "@/lib/prisma";
import { canAccessChat, canModifyChat, getChatParticipants } from "@/lib/chat-access";

const chat = vi.mocked(prisma.chat.findFirst);
const folder = vi.mocked(prisma.workspaceFolder.findUnique);
const member = vi.mocked(prisma.workspaceMember.findUnique);
const members = vi.mocked(prisma.workspaceMember.findMany);

beforeEach(() => {
    vi.clearAllMocks();
});

describe("canAccessChat", () => {
    it("denies access to a missing or soft-deleted chat", async () => {
        chat.mockResolvedValue(null as never);
        expect(await canAccessChat("c1", "u1", false)).toBe(false);
    });

    it("grants access to the owner", async () => {
        chat.mockResolvedValue({ userId: "u1", workspaceFolderId: null } as never);
        expect(await canAccessChat("c1", "u1", false)).toBe(true);
    });

    it("grants access to a global admin even when not the owner", async () => {
        chat.mockResolvedValue({ userId: "owner", workspaceFolderId: null } as never);
        expect(await canAccessChat("c1", "someone-else", true)).toBe(true);
    });

    it("denies a non-owner on a personal (non-workspace) chat", async () => {
        chat.mockResolvedValue({ userId: "owner", workspaceFolderId: null } as never);
        expect(await canAccessChat("c1", "stranger", false)).toBe(false);
    });

    it("grants access to any workspace member of a collaborative chat", async () => {
        chat.mockResolvedValue({ userId: "owner", workspaceFolderId: "f1" } as never);
        folder.mockResolvedValue({ workspaceId: "w1" } as never);
        member.mockResolvedValue({ id: "m1" } as never);
        expect(await canAccessChat("c1", "member", false)).toBe(true);
    });

    it("denies a non-member on a collaborative chat", async () => {
        chat.mockResolvedValue({ userId: "owner", workspaceFolderId: "f1" } as never);
        folder.mockResolvedValue({ workspaceId: "w1" } as never);
        member.mockResolvedValue(null as never);
        expect(await canAccessChat("c1", "outsider", false)).toBe(false);
    });

    it("denies when the folder no longer resolves to a workspace", async () => {
        chat.mockResolvedValue({ userId: "owner", workspaceFolderId: "f1" } as never);
        folder.mockResolvedValue(null as never);
        expect(await canAccessChat("c1", "member", false)).toBe(false);
    });
});

describe("canModifyChat", () => {
    it("grants the owner destructive access", async () => {
        chat.mockResolvedValue({ userId: "u1", workspaceFolderId: null } as never);
        expect(await canModifyChat("c1", "u1", false)).toBe(true);
    });

    it("grants a global admin destructive access", async () => {
        chat.mockResolvedValue({ userId: "owner", workspaceFolderId: null } as never);
        expect(await canModifyChat("c1", "admin", true)).toBe(true);
    });

    it("grants workspace OWNER/ADMIN destructive access", async () => {
        chat.mockResolvedValue({ userId: "owner", workspaceFolderId: "f1" } as never);
        folder.mockResolvedValue({ workspaceId: "w1" } as never);
        member.mockResolvedValue({ role: "ADMIN" } as never);
        expect(await canModifyChat("c1", "wsadmin", false)).toBe(true);

        member.mockResolvedValue({ role: "OWNER" } as never);
        expect(await canModifyChat("c1", "wsowner", false)).toBe(true);
    });

    it("denies a plain workspace MEMBER destructive access", async () => {
        chat.mockResolvedValue({ userId: "owner", workspaceFolderId: "f1" } as never);
        folder.mockResolvedValue({ workspaceId: "w1" } as never);
        member.mockResolvedValue({ role: "MEMBER" } as never);
        expect(await canModifyChat("c1", "member", false)).toBe(false);
    });

    it("denies a non-member on a collaborative chat", async () => {
        chat.mockResolvedValue({ userId: "owner", workspaceFolderId: "f1" } as never);
        folder.mockResolvedValue({ workspaceId: "w1" } as never);
        member.mockResolvedValue(null as never);
        expect(await canModifyChat("c1", "outsider", false)).toBe(false);
    });
});

describe("getChatParticipants", () => {
    it("returns an empty list for a missing chat", async () => {
        chat.mockResolvedValue(null as never);
        expect(await getChatParticipants("c1")).toEqual([]);
    });

    it("returns just the owner for a personal chat", async () => {
        chat.mockResolvedValue({
            userId: "u1",
            workspaceFolderId: null,
            user: { id: "u1", name: "Ada", image: null },
        } as never);
        const participants = await getChatParticipants("c1");
        expect(participants).toEqual([{ userId: "u1", name: "Ada", image: null, role: "OWNER" }]);
    });

    it("returns all workspace members for a collaborative chat", async () => {
        chat.mockResolvedValue({
            userId: "u1",
            workspaceFolderId: "f1",
            user: { id: "u1", name: "Ada", image: null },
        } as never);
        folder.mockResolvedValue({ workspaceId: "w1" } as never);
        members.mockResolvedValue([
            { role: "OWNER", user: { id: "u1", name: "Ada", image: null } },
            { role: "MEMBER", user: { id: "u2", name: "Bob", image: null } },
        ] as never);
        const participants = await getChatParticipants("c1");
        expect(participants).toHaveLength(2);
        expect(participants.map((p) => p.userId)).toEqual(["u1", "u2"]);
        expect(participants[1].role).toBe("MEMBER");
    });
});
