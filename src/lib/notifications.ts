import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import type { NotificationType } from "@/types";

interface CreateNotificationOptions {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    link?: string;
    refId?: string;
    /** If set, skip creating if a notification of this type+refId was created within this many seconds. */
    cooldownSeconds?: number;
}

export async function createNotification({
    userId,
    type,
    title,
    body,
    link,
    refId,
    cooldownSeconds,
}: CreateNotificationOptions): Promise<void> {
    try {
        if (cooldownSeconds && refId) {
            const cutoff = new Date(Date.now() - cooldownSeconds * 1000);
            const recent = await prisma.notification.findFirst({
                where: { userId, type, refId, createdAt: { gte: cutoff } },
                select: { id: true },
            });
            if (recent) return;
        }

        await prisma.notification.create({
            data: { userId, type, title, body, link, refId },
        });

        // Also dispatch a Web Push so users get it on a closed tab / installed app.
        // Fire-and-forget — sendPushToUser swallows its own errors.
        void sendPushToUser(userId, { title, body, url: link ?? "/", tag: refId ?? type });
    } catch {
        // fire-and-forget — never crash the calling flow
    }
}
