import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the prisma singleton and the notification helper so the budget logic can
// be exercised without a database or push stack. Each test stubs only what it
// needs.
vi.mock("@/lib/prisma", () => ({
    prisma: {
        chat: { findMany: vi.fn(), findUnique: vi.fn() },
        usageLog: { groupBy: vi.fn() },
        workspace: { findUnique: vi.fn(), update: vi.fn() },
        workspaceMember: { findMany: vi.fn() },
    },
}));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import {
    currentPeriod,
    getWorkspaceMonthSpendUsd,
    getChatWorkspaceBudget,
    checkChatBudget,
    recordWorkspaceSpendAndAlert,
} from "@/lib/budget";

const chatMany = vi.mocked(prisma.chat.findMany);
const chatUnique = vi.mocked(prisma.chat.findUnique);
const usageGroupBy = vi.mocked(prisma.usageLog.groupBy);
const wsUnique = vi.mocked(prisma.workspace.findUnique);
const wsUpdate = vi.mocked(prisma.workspace.update);
const memberMany = vi.mocked(prisma.workspaceMember.findMany);
const notify = vi.mocked(createNotification);

beforeEach(() => {
    vi.clearAllMocks();
    wsUpdate.mockResolvedValue({} as never);
    notify.mockResolvedValue(undefined as never);
});

describe("currentPeriod", () => {
    it("formats a UTC year-month key", () => {
        expect(currentPeriod(new Date("2026-06-06T12:00:00Z"))).toBe("2026-06");
        expect(currentPeriod(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
        expect(currentPeriod(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
    });
});

describe("getWorkspaceMonthSpendUsd", () => {
    it("returns 0 when the workspace has no chats", async () => {
        chatMany.mockResolvedValue([] as never);
        expect(await getWorkspaceMonthSpendUsd("w1")).toBe(0);
        expect(usageGroupBy).not.toHaveBeenCalled();
    });

    it("sums per-model usage into an estimated cost", async () => {
        chatMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }] as never);
        usageGroupBy.mockResolvedValue([
            // gpt-4o: input 2.5, output 10 per 1M
            { model: "openai/gpt-4o", _sum: { inputTokens: 1_000_000, outputTokens: 1_000_000 } },
        ] as never);
        // 2.5 + 10 = 12.5
        expect(await getWorkspaceMonthSpendUsd("w1")).toBeCloseTo(12.5, 6);
    });
});

describe("getChatWorkspaceBudget", () => {
    it("returns null for a personal (non-workspace) chat", async () => {
        chatUnique.mockResolvedValue({ workspaceFolder: null } as never);
        expect(await getChatWorkspaceBudget("c1")).toBeNull();
    });

    it("returns null when the workspace has no cap", async () => {
        chatUnique.mockResolvedValue({ workspaceFolder: { workspaceId: "w1" } } as never);
        wsUnique.mockResolvedValue({ monthlyBudgetUsd: null } as never);
        expect(await getChatWorkspaceBudget("c1")).toBeNull();
    });

    it("returns the cap when set", async () => {
        chatUnique.mockResolvedValue({ workspaceFolder: { workspaceId: "w1" } } as never);
        wsUnique.mockResolvedValue({ monthlyBudgetUsd: 50 } as never);
        expect(await getChatWorkspaceBudget("c1")).toEqual({ workspaceId: "w1", monthlyBudgetUsd: 50 });
    });
});

describe("checkChatBudget", () => {
    it("returns null when no cap governs the chat", async () => {
        chatUnique.mockResolvedValue({ workspaceFolder: null } as never);
        expect(await checkChatBudget("c1")).toBeNull();
    });

    it("does not block while under the cap", async () => {
        chatUnique.mockResolvedValue({ workspaceFolder: { workspaceId: "w1" } } as never);
        wsUnique.mockResolvedValue({ monthlyBudgetUsd: 100 } as never);
        chatMany.mockResolvedValue([{ id: "c1" }] as never);
        usageGroupBy.mockResolvedValue([
            { model: "openai/gpt-4o", _sum: { inputTokens: 1_000_000, outputTokens: 1_000_000 } }, // $12.50
        ] as never);
        const res = await checkChatBudget("c1");
        expect(res?.blocked).toBe(false);
        expect(res?.spendUsd).toBeCloseTo(12.5, 6);
    });

    it("blocks once spend reaches the cap", async () => {
        chatUnique.mockResolvedValue({ workspaceFolder: { workspaceId: "w1" } } as never);
        wsUnique.mockResolvedValue({ monthlyBudgetUsd: 10 } as never);
        chatMany.mockResolvedValue([{ id: "c1" }] as never);
        usageGroupBy.mockResolvedValue([
            { model: "openai/gpt-4o", _sum: { inputTokens: 1_000_000, outputTokens: 1_000_000 } }, // $12.50 ≥ $10
        ] as never);
        const res = await checkChatBudget("c1");
        expect(res?.blocked).toBe(true);
    });
});

describe("recordWorkspaceSpendAndAlert", () => {
    const period = currentPeriod();

    function stubSpend(usd: number) {
        // one chat, one model row whose cost equals `usd`. DEFAULT_PRICE input=1/1M
        // so `usd` input-tokens-in-millions → $usd.
        chatMany.mockResolvedValue([{ id: "c1" }] as never);
        usageGroupBy.mockResolvedValue([
            { model: "x/unknown", _sum: { inputTokens: usd * 1_000_000, outputTokens: 0 } },
        ] as never);
    }

    it("no-ops when the workspace has no cap", async () => {
        wsUnique.mockResolvedValue({ name: "W", monthlyBudgetUsd: null, budgetPeriod: null, budgetAlert80: false, budgetAlert100: false } as never);
        await recordWorkspaceSpendAndAlert("w1");
        expect(notify).not.toHaveBeenCalled();
        expect(wsUpdate).not.toHaveBeenCalled();
    });

    it("fires the 80% alert once and persists the flag", async () => {
        wsUnique.mockResolvedValue({ name: "W", monthlyBudgetUsd: 100, budgetPeriod: period, budgetAlert80: false, budgetAlert100: false } as never);
        memberMany.mockResolvedValue([{ userId: "owner" }, { userId: "admin" }] as never);
        stubSpend(85); // 85% of 100

        await recordWorkspaceSpendAndAlert("w1");

        expect(notify).toHaveBeenCalledTimes(2); // owner + admin
        expect(notify.mock.calls[0][0]).toMatchObject({ type: "budget_alert" });
        expect(wsUpdate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ budgetAlert80: true, budgetAlert100: false, budgetPeriod: period }),
        }));
    });

    it("does not re-fire the 80% alert when already sent this period", async () => {
        wsUnique.mockResolvedValue({ name: "W", monthlyBudgetUsd: 100, budgetPeriod: period, budgetAlert80: true, budgetAlert100: false } as never);
        memberMany.mockResolvedValue([{ userId: "owner" }] as never);
        stubSpend(85);

        await recordWorkspaceSpendAndAlert("w1");
        expect(notify).not.toHaveBeenCalled();
    });

    it("fires the 100% alert and marks both thresholds sent", async () => {
        wsUnique.mockResolvedValue({ name: "W", monthlyBudgetUsd: 100, budgetPeriod: period, budgetAlert80: false, budgetAlert100: false } as never);
        memberMany.mockResolvedValue([{ userId: "owner" }] as never);
        stubSpend(120); // over cap

        await recordWorkspaceSpendAndAlert("w1");

        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][0]).toMatchObject({ type: "budget_alert" });
        expect(wsUpdate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ budgetAlert80: true, budgetAlert100: true }),
        }));
    });

    it("resets stale alert flags from a previous period before evaluating", async () => {
        // Flags set, but for an old period; spend back under 80% this month.
        wsUnique.mockResolvedValue({ name: "W", monthlyBudgetUsd: 100, budgetPeriod: "2000-01", budgetAlert80: true, budgetAlert100: true } as never);
        stubSpend(10);

        await recordWorkspaceSpendAndAlert("w1");

        expect(notify).not.toHaveBeenCalled();
        // Period rolled over → flags reset to false and period updated.
        expect(wsUpdate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ budgetPeriod: period, budgetAlert80: false, budgetAlert100: false }),
        }));
    });
});
