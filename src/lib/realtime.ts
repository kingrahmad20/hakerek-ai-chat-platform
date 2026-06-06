import { EventEmitter } from "node:events";

/**
 * In-process pub/sub for real-time collaborative chats.
 *
 * Events for a chat are fan-out to all connected SSE subscribers (see
 * `/api/chats/[chatId]/events`). A presence registry tracks which users
 * currently have the chat open, ref-counted per connection so multiple tabs
 * from one user collapse to a single viewer.
 *
 * NOTE: this is in-process and only works for a single Node instance — which
 * matches the current single-container deployment. If the app is ever scaled
 * horizontally, replace the EventEmitter + registry with a Redis pub/sub
 * channel (publish/subscribe) and a shared presence store.
 */

export interface ChatViewer {
    userId: string;
    name: string | null;
    image: string | null;
}

export type RealtimeEvent =
    | { type: "message"; message: RealtimeMessage; triggeredBy?: string }
    | { type: "assistant-start"; triggeredBy: string }
    | { type: "assistant-done"; triggeredBy: string }
    | { type: "typing"; userId: string; name: string | null; typing: boolean }
    | { type: "presence"; viewers: ChatViewer[] }
    | { type: "title"; title: string };

export interface RealtimeMessage {
    id: string;
    role: string;
    content: string;
    authorId: string | null;
    authorName?: string | null;
    authorImage?: string | null;
    model?: string | null;
    createdAt: string;
}

interface ViewerEntry {
    name: string | null;
    image: string | null;
    connections: number;
}

// Singletons on globalThis so they survive Next.js hot-reload and are shared
// across all route module instances in the one process (same pattern as prisma.ts).
const globalForRealtime = globalThis as unknown as {
    chatEmitter?: EventEmitter;
    chatPresence?: Map<string, Map<string, ViewerEntry>>;
};

const emitter =
    globalForRealtime.chatEmitter ??
    (globalForRealtime.chatEmitter = (() => {
        const e = new EventEmitter();
        e.setMaxListeners(0); // many concurrent SSE subscribers
        return e;
    })());

const presence =
    globalForRealtime.chatPresence ?? (globalForRealtime.chatPresence = new Map());

/** Publish an event to every subscriber of `chatId`. */
export function publish(chatId: string, event: RealtimeEvent): void {
    emitter.emit(chatId, event);
}

/** Subscribe to a chat's events. Returns an unsubscribe function. */
export function subscribe(chatId: string, handler: (event: RealtimeEvent) => void): () => void {
    emitter.on(chatId, handler);
    return () => emitter.off(chatId, handler);
}

function viewerList(chatId: string): ChatViewer[] {
    const map = presence.get(chatId);
    if (!map) return [];
    const viewers: ChatViewer[] = [];
    for (const [userId, v] of map) {
        viewers.push({ userId, name: v.name, image: v.image });
    }
    return viewers;
}

/** Snapshot of who currently has the chat open. */
export function getViewers(chatId: string): ChatViewer[] {
    return viewerList(chatId);
}

/** Register a viewer connection (ref-counted). Publishes presence if the set changed. */
export function addViewer(chatId: string, viewer: ChatViewer): void {
    let map = presence.get(chatId);
    if (!map) {
        map = new Map();
        presence.set(chatId, map);
    }
    const existing = map.get(viewer.userId);
    if (existing) {
        existing.connections++;
        return; // already visible — no presence change
    }
    map.set(viewer.userId, { name: viewer.name, image: viewer.image, connections: 1 });
    publish(chatId, { type: "presence", viewers: viewerList(chatId) });
}

/** Drop a viewer connection (ref-counted). Publishes presence when the last tab closes. */
export function removeViewer(chatId: string, userId: string): void {
    const map = presence.get(chatId);
    if (!map) return;
    const entry = map.get(userId);
    if (!entry) return;
    entry.connections--;
    if (entry.connections > 0) return;
    map.delete(userId);
    if (map.size === 0) presence.delete(chatId);
    publish(chatId, { type: "presence", viewers: viewerList(chatId) });
}
