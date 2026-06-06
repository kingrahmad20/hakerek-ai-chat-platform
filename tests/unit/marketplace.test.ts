import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        workspaceMember: { findFirst: vi.fn() },
    },
}));

import { prisma } from "@/lib/prisma";
import {
    sanitizePersona,
    sanitizeSlashCommand,
    isItemType,
    isVisibility,
    canViewItem,
} from "@/lib/marketplace";

const wsMember = vi.mocked(prisma.workspaceMember.findFirst);

beforeEach(() => vi.clearAllMocks());

describe("isItemType / isVisibility", () => {
    it("accepts known values and rejects the rest", () => {
        expect(isItemType("persona")).toBe(true);
        expect(isItemType("knowledge_base")).toBe(true);
        expect(isItemType("nope")).toBe(false);
        expect(isVisibility("workspace")).toBe(true);
        expect(isVisibility("private")).toBe(false);
    });
});

describe("sanitizePersona", () => {
    it("returns null without a name or system prompt", () => {
        expect(sanitizePersona({ name: "", systemPrompt: "x" })).toBeNull();
        expect(sanitizePersona({ name: "x", systemPrompt: "  " })).toBeNull();
        expect(sanitizePersona("nope")).toBeNull();
    });

    it("keeps valid fields and drops unknown tool ids", () => {
        const out = sanitizePersona({
            name: "Helper",
            description: "d",
            systemPrompt: "be helpful",
            model: "openai:gpt-4o",
            knowledgeBaseIds: ["kb1", 5, "kb2"],
            toolIds: ["web_search", "mcp:srv1", "totally_made_up"],
        });
        expect(out).not.toBeNull();
        expect(out!.name).toBe("Helper");
        expect(out!.knowledgeBaseIds).toEqual(["kb1", "kb2"]);
        // web_search is a real tool, mcp: prefix is allowed, the bogus one is dropped.
        expect(out!.toolIds).toEqual(["web_search", "mcp:srv1"]);
    });

    it("truncates over-long fields", () => {
        const out = sanitizePersona({ name: "n".repeat(500), systemPrompt: "s".repeat(9000) });
        expect(out!.name.length).toBe(100);
        expect(out!.systemPrompt.length).toBe(4000);
    });
});

describe("sanitizeSlashCommand", () => {
    it("normalises the command slug and requires a prompt", () => {
        expect(sanitizeSlashCommand({ command: "My Cmd!", prompt: "" })).toBeNull();
        const out = sanitizeSlashCommand({ command: "My Cmd!", description: "d", prompt: "do it" });
        expect(out).not.toBeNull();
        expect(out!.command).toBe("mycmd"); // lowercased, non-alnum stripped
        expect(out!.prompt).toBe("do it");
    });
});

describe("canViewItem", () => {
    it("allows anyone (even anon) to view public and unlisted items", async () => {
        expect(await canViewItem({ visibility: "public", workspaceId: null, authorId: "a" }, null)).toBe(true);
        expect(await canViewItem({ visibility: "unlisted", workspaceId: null, authorId: "a" }, null)).toBe(true);
    });

    it("requires workspace membership for workspace items", async () => {
        wsMember.mockResolvedValue(null as never);
        expect(await canViewItem({ visibility: "workspace", workspaceId: "w1", authorId: "a" }, "stranger")).toBe(false);

        wsMember.mockResolvedValue({ id: "m1" } as never);
        expect(await canViewItem({ visibility: "workspace", workspaceId: "w1", authorId: "a" }, "member")).toBe(true);
    });

    it("always lets the author view their own workspace item, and denies anon", async () => {
        expect(await canViewItem({ visibility: "workspace", workspaceId: "w1", authorId: "a" }, "a")).toBe(true);
        expect(await canViewItem({ visibility: "workspace", workspaceId: "w1", authorId: "a" }, null)).toBe(false);
        expect(wsMember).not.toHaveBeenCalled();
    });
});
