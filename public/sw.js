/* Hakerek service worker — Web Push + installable PWA shell.
 * Intentionally cache-light: the app is auth-gated and highly dynamic, so we do
 * NOT cache API/auth responses. We only provide push handling and an offline
 * fallback for navigations. */

const OFFLINE_URL = "/offline.html";
const CACHE = "hakerek-shell-v1";

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL])).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Offline fallback for page navigations only. Everything else hits the network.
self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.mode !== "navigate") return;
    event.respondWith(
        fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error()))
    );
});

// ── Web Push ──────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch {
        payload = { title: "Hakerek", body: event.data ? event.data.text() : "" };
    }

    const title = payload.title || "Hakerek";
    const options = {
        body: payload.body || "",
        icon: payload.icon || "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: payload.tag || undefined,
        data: { url: payload.url || "/" },
        timestamp: Date.now(),
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// Focus an existing tab if open, otherwise open the target URL.
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.url) || "/";
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                try {
                    const url = new URL(client.url);
                    if (url.origin === self.location.origin && "focus" in client) {
                        client.focus();
                        if ("navigate" in client && target !== "/") client.navigate(target);
                        return;
                    }
                } catch {
                    /* ignore */
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(target);
        })
    );
});
