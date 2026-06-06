import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// VAPID keys live in the Setting table (runtime config, not .env — see AGENTS.md).
// They're generated lazily on first use and reused across restarts.
const PUBLIC_KEY = "vapidPublicKey";
const PRIVATE_KEY = "vapidPrivateKey";
const SUBJECT_KEY = "vapidSubject";

interface VapidKeys {
    publicKey: string;
    privateKey: string;
    subject: string;
}

let cached: VapidKeys | null = null;

/** Load VAPID keys from the Setting table, generating + persisting them on first use. */
export async function getVapidKeys(): Promise<VapidKeys> {
    if (cached) return cached;

    const rows = await prisma.setting.findMany({
        where: { key: { in: [PUBLIC_KEY, PRIVATE_KEY, SUBJECT_KEY] } },
    });
    const get = (k: string) => rows.find((r) => r.key === k)?.value;

    let publicKey = get(PUBLIC_KEY);
    let privateKey = get(PRIVATE_KEY);
    const subject = get(SUBJECT_KEY) || "mailto:admin@localhost";

    if (!publicKey || !privateKey) {
        const generated = webpush.generateVAPIDKeys();
        publicKey = generated.publicKey;
        privateKey = generated.privateKey;
        await prisma.$transaction([
            prisma.setting.upsert({
                where: { key: PUBLIC_KEY },
                create: { key: PUBLIC_KEY, value: publicKey },
                update: { value: publicKey },
            }),
            prisma.setting.upsert({
                where: { key: PRIVATE_KEY },
                create: { key: PRIVATE_KEY, value: privateKey },
                update: { value: privateKey },
            }),
        ]);
    }

    cached = { publicKey, privateKey, subject };
    return cached;
}

/** Public key only — safe to expose to the browser for PushManager.subscribe(). */
export async function getVapidPublicKey(): Promise<string> {
    return (await getVapidKeys()).publicKey;
}

export interface PushPayload {
    title: string;
    body?: string;
    url?: string;
    icon?: string;
    tag?: string;
}

/**
 * Send a web-push notification to every registered device for a user.
 * Fire-and-forget friendly: never throws. Prunes dead subscriptions (404/410).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
    try {
        const subs = await prisma.pushSubscription.findMany({ where: { userId } });
        if (subs.length === 0) return;

        const { publicKey, privateKey, subject } = await getVapidKeys();
        webpush.setVapidDetails(subject, publicKey, privateKey);

        const body = JSON.stringify(payload);
        const stale: string[] = [];

        await Promise.all(
            subs.map(async (sub) => {
                try {
                    await webpush.sendNotification(
                        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                        body
                    );
                } catch (err: unknown) {
                    const status = (err as { statusCode?: number })?.statusCode;
                    if (status === 404 || status === 410) stale.push(sub.endpoint);
                }
            })
        );

        if (stale.length > 0) {
            await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: stale } } });
        }
    } catch {
        // never crash the calling flow
    }
}
