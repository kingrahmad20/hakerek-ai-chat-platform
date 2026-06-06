// Per-workspace budget guardrails.
//
// A workspace OWNER/ADMIN can set `monthlyBudgetUsd`, an estimated-spend cap for
// the current calendar month. Spend is attributed to a workspace the same way
// usage analytics does it: UsageLog.chatId → Chat.workspaceFolderId →
// WorkspaceFolder.workspaceId, costed via `estimateCostUsd`.
//
// Two guardrails run off the same spend figure:
//   • Threshold alerts — at 80% and 100% of the cap we notify the workspace's
//     OWNER/ADMIN members once per period (dedup via the `budgetAlert*` flags,
//     reset when the month rolls over or the cap changes).
//   • Hard stop — once spend has reached 100% of the cap, new AI requests in the
//     workspace's chats are rejected before any model call is made.
//
// Token cost can't be known until after a completion, so the hard stop is
// applied at the *start* of the next request after the cap is crossed (the
// request that tips the workspace over still completes). This matches how the
// per-user token quota in /api/chat behaves.

import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/pricing";
import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";

/** Current calendar-month key in UTC, e.g. "2026-06". */
export function currentPeriod(now: Date = new Date()): string {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Start of the current calendar month (local-time, matching the per-user quota window). */
function monthStart(now: Date = new Date()): Date {
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Estimated USD spend for a workspace over the current calendar month.
 * Sums UsageLog for the workspace's chats, costed per-model.
 */
export async function getWorkspaceMonthSpendUsd(workspaceId: string, now: Date = new Date()): Promise<number> {
    const chats = await prisma.chat.findMany({
        where: { workspaceFolder: { workspaceId } },
        select: { id: true },
    });
    if (chats.length === 0) return 0;
    const chatIds = chats.map((c) => c.id);

    const rows = await prisma.usageLog.groupBy({
        by: ["model"],
        where: { chatId: { in: chatIds }, createdAt: { gte: monthStart(now) } },
        _sum: { inputTokens: true, outputTokens: true },
    });

    let total = 0;
    for (const row of rows) {
        total += estimateCostUsd(row.model, row._sum.inputTokens ?? 0, row._sum.outputTokens ?? 0);
    }
    return total;
}

interface ChatBudget {
    workspaceId: string;
    monthlyBudgetUsd: number;
}

/**
 * Resolve the budget that governs a chat, or null when the chat is personal or
 * its workspace has no cap set. Used by the streaming route to decide whether a
 * hard stop applies.
 */
export async function getChatWorkspaceBudget(chatId: string): Promise<ChatBudget | null> {
    const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        select: { workspaceFolder: { select: { workspaceId: true } } },
    });
    const workspaceId = chat?.workspaceFolder?.workspaceId;
    if (!workspaceId) return null;

    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { monthlyBudgetUsd: true },
    });
    if (ws?.monthlyBudgetUsd == null) return null;
    return { workspaceId, monthlyBudgetUsd: ws.monthlyBudgetUsd };
}

export interface BudgetCheck {
    /** True when the workspace has reached its cap and the request must be blocked. */
    blocked: boolean;
    workspaceId: string;
    budgetUsd: number;
    spendUsd: number;
}

/**
 * Pre-flight guardrail for the streaming route. Returns null when no cap applies
 * (personal chat, or workspace without a budget), otherwise the spend/cap state.
 * `blocked` is true once spend has reached the cap.
 */
export async function checkChatBudget(chatId: string): Promise<BudgetCheck | null> {
    const budget = await getChatWorkspaceBudget(chatId);
    if (!budget) return null;
    const spendUsd = await getWorkspaceMonthSpendUsd(budget.workspaceId);
    return {
        blocked: spendUsd >= budget.monthlyBudgetUsd,
        workspaceId: budget.workspaceId,
        budgetUsd: budget.monthlyBudgetUsd,
        spendUsd,
    };
}

/** OWNER/ADMIN member user ids — the recipients of budget notifications. */
async function budgetNotifyRecipients(workspaceId: string): Promise<string[]> {
    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId, role: { in: ["OWNER", "ADMIN"] } },
        select: { userId: true },
    });
    return members.map((m) => m.userId);
}

/**
 * Recompute a workspace's month-to-date spend after a completion and fire the
 * 80% / 100% threshold notifications if newly crossed. Idempotent within a
 * period: the `budgetAlert80` / `budgetAlert100` flags ensure each threshold
 * notifies its OWNER/ADMIN members at most once, and they reset when the period
 * rolls over. Safe to call fire-and-forget; never throws.
 */
export async function recordWorkspaceSpendAndAlert(workspaceId: string): Promise<void> {
    try {
        const ws = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                name: true,
                monthlyBudgetUsd: true,
                budgetPeriod: true,
                budgetAlert80: true,
                budgetAlert100: true,
            },
        });
        if (!ws || ws.monthlyBudgetUsd == null || ws.monthlyBudgetUsd <= 0) return;

        const period = currentPeriod();
        // Roll the alert state into the current period before evaluating.
        let alert80 = ws.budgetPeriod === period ? ws.budgetAlert80 : false;
        let alert100 = ws.budgetPeriod === period ? ws.budgetAlert100 : false;
        const periodChanged = ws.budgetPeriod !== period;

        const spendUsd = await getWorkspaceMonthSpendUsd(workspaceId);
        const pct = spendUsd / ws.monthlyBudgetUsd;

        const crossed100 = pct >= 1 && !alert100;
        const crossed80 = pct >= 0.8 && !alert80;

        if (crossed100 || crossed80 || periodChanged) {
            if (crossed100 || crossed80) {
                const recipients = await budgetNotifyRecipients(workspaceId);
                const atCap = crossed100;
                const title = atCap
                    ? `Budget reached for "${ws.name}"`
                    : `Budget at 80% for "${ws.name}"`;
                const body = atCap
                    ? `This workspace has reached its $${ws.monthlyBudgetUsd.toFixed(2)} monthly cap (≈$${spendUsd.toFixed(2)} spent). New AI requests are paused until next month or until the cap is raised.`
                    : `This workspace has used ≈$${spendUsd.toFixed(2)} of its $${ws.monthlyBudgetUsd.toFixed(2)} monthly cap (${Math.round(pct * 100)}%).`;
                await Promise.all(
                    recipients.map((userId) =>
                        createNotification({
                            userId,
                            type: "budget_alert",
                            title,
                            body,
                            link: "/",
                            // refId scoped to threshold+period so the dedup window in
                            // createNotification can't collapse the 80% and 100% alerts.
                            refId: `budget:${workspaceId}:${period}:${atCap ? 100 : 80}`,
                        })
                    )
                );
                // Crossing 100% implies 80% is also satisfied.
                if (crossed100) { alert100 = true; alert80 = true; }
                if (crossed80) alert80 = true;
            }

            await prisma.workspace.update({
                where: { id: workspaceId },
                data: { budgetPeriod: period, budgetAlert80: alert80, budgetAlert100: alert100 },
            });

            if (crossed100 || crossed80) {
                logger.info("workspace_budget_alert", {
                    workspaceId, period, pct: Math.round(pct * 100), spendUsd, budget: ws.monthlyBudgetUsd,
                });
            }
        }
    } catch (err) {
        logger.warn("workspace_budget_alert_failed", { workspaceId, error: String(err) });
    }
}
