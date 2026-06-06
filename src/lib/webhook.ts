import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { safeFetch } from "@/lib/ssrf";

export type WebhookEventType =
    | "chat.created"
    | "chat.updated"
    | "chat.deleted"
    | "message.created"
    | "scheduled_agent.completed";

// Exponential backoff delays: 1m → 5m → 30m → 2h
const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000];

export async function dispatchWebhook(
    userId: string,
    event: WebhookEventType,
    data: object
): Promise<void> {
    const webhooks = await prisma.webhook.findMany({
        where: { userId, active: true, events: { has: event } },
    });

    if (webhooks.length === 0) return;

    const body = JSON.stringify({ event, data, timestamp: new Date().toISOString() });

    await Promise.allSettled(
        webhooks.map((webhook) => deliverWebhook(webhook, event, body))
    );
}

async function deliverWebhook(
    webhook: { id: string; url: string; secret: string },
    event: string,
    body: string
): Promise<void> {
    const { status, success, error } = await attemptDelivery(webhook, event, body);

    await prisma.webhookDelivery.create({
        data: {
            webhookId: webhook.id,
            event,
            payload: body,
            status,
            success,
            retryCount: 0,
            nextRetryAt: success ? null : computeNextRetry(0),
            lastError: error ?? null,
        },
    }).catch(() => {});
}

export async function processWebhookRetries(): Promise<{ processed: number; succeeded: number }> {
    const now = new Date();

    const pending = await prisma.webhookDelivery.findMany({
        where: {
            success: false,
            nextRetryAt: { lte: now },
            webhook: { active: true },
        },
        include: { webhook: true },
        take: 100,
        orderBy: { nextRetryAt: "asc" },
    });

    let succeeded = 0;

    await Promise.allSettled(
        pending.map(async (delivery) => {
            const parsedPayload = JSON.parse(delivery.payload) as { event: string };
            const { status, success, error } = await attemptDelivery(
                delivery.webhook,
                parsedPayload.event,
                delivery.payload
            );

            const newRetryCount = delivery.retryCount + 1;
            const nextRetryAt = success ? null : computeNextRetry(newRetryCount);

            await prisma.webhookDelivery.update({
                where: { id: delivery.id },
                data: {
                    status,
                    success,
                    retryCount: newRetryCount,
                    nextRetryAt,
                    lastError: success ? null : (error ?? null),
                },
            });

            if (success) succeeded++;
        })
    );

    return { processed: pending.length, succeeded };
}

function computeNextRetry(retryCount: number): Date | null {
    const delayMs = RETRY_DELAYS_MS[retryCount];
    if (delayMs === undefined) return null;
    return new Date(Date.now() + delayMs);
}

async function attemptDelivery(
    webhook: { id: string; url: string; secret: string },
    event: string,
    body: string
): Promise<{ status: number; success: boolean; error?: string }> {
    const signature = createHmac("sha256", webhook.secret).update(body).digest("hex");

    try {
        // safeFetch validates the (user-supplied) URL against private/internal
        // ranges before connecting and does not follow redirects, blocking SSRF.
        const res = await safeFetch(webhook.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Signature": `sha256=${signature}`,
                "X-Webhook-Event": event,
            },
            body,
            maxRedirects: 0,
        });
        return { status: res.status, success: res.ok };
    } catch (err) {
        const errorMsg = String(err);
        logger.error("webhook_delivery_error", { webhookId: webhook.id, event, error: errorMsg });
        return { status: 0, success: false, error: errorMsg };
    }
}
