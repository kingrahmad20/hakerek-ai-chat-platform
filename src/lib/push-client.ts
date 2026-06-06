"use client";

// Browser-side Web Push helpers used by the notification UI.

export function isPushSupported(): boolean {
    return (
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window
    );
}

export function getPushPermission(): NotificationPermission | null {
    if (typeof Notification === "undefined") return null;
    return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

/**
 * Request permission and subscribe this browser to Web Push.
 * Returns true on success. Safe to call repeatedly (re-uses existing sub).
 */
export async function subscribeToPush(): Promise<boolean> {
    if (!isPushSupported()) return false;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const reg = await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
        const res = await fetch("/api/push/vapid");
        if (!res.ok) return false;
        const { publicKey } = await res.json();
        if (!publicKey) return false;
        sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
    }

    const save = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
    });
    return save.ok;
}

/** Unsubscribe this browser and remove the server-side record. */
export async function unsubscribeFromPush(): Promise<boolean> {
    if (!isPushSupported()) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;

    await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});

    await sub.unsubscribe().catch(() => {});
    return true;
}
