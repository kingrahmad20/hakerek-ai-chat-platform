"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (/sw.js) once on the client.
 * Mounted globally in the root layout so the app is installable and the push
 * handler is available regardless of which page the user lands on.
 */
export function ServiceWorkerRegister() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator)) return;
        // Avoid registering during local http dev where SW scope can interfere.
        navigator.serviceWorker.register("/sw.js").catch(() => {
            /* registration failure is non-fatal */
        });
    }, []);

    return null;
}
