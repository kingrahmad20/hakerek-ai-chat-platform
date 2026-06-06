/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatParticipant, ChatViewer } from "@/types";

interface RealtimeMessage {
    id: string;
    role: string;
    content: string;
    authorId: string | null;
    authorName?: string | null;
    authorImage?: string | null;
    model?: string | null;
    createdAt: string;
}

type RealtimeEvent =
    | { type: "message"; message: RealtimeMessage; triggeredBy?: string }
    | { type: "assistant-start"; triggeredBy: string }
    | { type: "assistant-done"; triggeredBy: string }
    | { type: "typing"; userId: string; name: string | null; typing: boolean }
    | { type: "presence"; viewers: ChatViewer[] }
    | { type: "title"; title: string };

interface UseChatRealtimeArgs {
    chatId: string | null;
    enabled: boolean;
    currentUserId: string | null;
    participants: ChatParticipant[];
    setMessages: (updater: (prev: any[]) => any[]) => void;
    onTitle?: (title: string) => void;
}

const TYPING_TTL_MS = 4000;

/** Convert a persisted message (`content` string, possibly JSON with files) into the
 *  parts shape the renderer expects — mirrors the mapping in chat-interface selectChat. */
function toChatMessage(m: RealtimeMessage): ChatMessage {
    let parts: any[] = [{ type: "text", text: m.content }];
    let content = m.content;
    try {
        const parsed = JSON.parse(m.content);
        if (parsed && typeof parsed === "object" && "text" in parsed) {
            content = parsed.text ?? "";
            parts = [
                { type: "text", text: content },
                ...(parsed.files ?? []).map((url: string) => ({ type: "file", mediaType: "image/jpeg", url })),
            ];
        }
    } catch { /* plain text */ }
    return {
        id: m.id,
        role: m.role as ChatMessage["role"],
        content,
        parts,
        authorId: m.authorId,
        authorName: m.authorName ?? null,
        authorImage: m.authorImage ?? null,
    };
}

/**
 * Subscribe to a collaborative chat's SSE stream and surface live state
 * (viewers, typing, "AI is responding"). Incoming messages from OTHER
 * participants are injected into the `useChat` message list via `setMessages`;
 * echoes of the local user's own activity are ignored (the author already has
 * them from their own HTTP stream).
 */
export function useChatRealtime({ chatId, enabled, currentUserId, participants, setMessages, onTitle }: UseChatRealtimeArgs) {
    const [viewers, setViewers] = useState<ChatViewer[]>([]);
    const [typingUsers, setTypingUsers] = useState<{ userId: string; name: string | null }[]>([]);
    const [respondingFor, setRespondingFor] = useState<string | null>(null); // userId whose prompt the AI is answering

    const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const onTitleRef = useRef(onTitle);
    onTitleRef.current = onTitle;
    const setMessagesRef = useRef(setMessages);
    setMessagesRef.current = setMessages;

    const clearTyping = useCallback((userId: string) => {
        const timer = typingTimers.current.get(userId);
        if (timer) clearTimeout(timer);
        typingTimers.current.delete(userId);
        setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
    }, []);

    useEffect(() => {
        if (!enabled || !chatId) {
            setViewers([]);
            setTypingUsers([]);
            setRespondingFor(null);
            return;
        }

        const source = new EventSource(`/api/chats/${chatId}/events`);
        const timers = typingTimers.current;

        source.onmessage = (e) => {
            let event: RealtimeEvent;
            try {
                event = JSON.parse(e.data);
            } catch {
                return;
            }

            switch (event.type) {
                case "message": {
                    const m = event.message;
                    // Ignore echoes of the local user's own activity.
                    if (m.role === "user" && m.authorId === currentUserId) return;
                    if (m.role === "assistant" && event.triggeredBy === currentUserId) return;
                    const mapped = toChatMessage(m);
                    setMessagesRef.current((prev) => {
                        if (prev.some((p) => p.id === mapped.id)) return prev;
                        return [...prev, mapped];
                    });
                    break;
                }
                case "assistant-start":
                    if (event.triggeredBy !== currentUserId) setRespondingFor(event.triggeredBy);
                    break;
                case "assistant-done":
                    if (event.triggeredBy !== currentUserId) setRespondingFor(null);
                    break;
                case "typing": {
                    if (event.userId === currentUserId) return;
                    if (!event.typing) {
                        clearTyping(event.userId);
                        break;
                    }
                    setTypingUsers((prev) =>
                        prev.some((u) => u.userId === event.userId)
                            ? prev
                            : [...prev, { userId: event.userId, name: event.name }]
                    );
                    const existing = timers.get(event.userId);
                    if (existing) clearTimeout(existing);
                    timers.set(event.userId, setTimeout(() => clearTyping(event.userId), TYPING_TTL_MS));
                    break;
                }
                case "presence":
                    setViewers(event.viewers.filter((v) => v.userId !== currentUserId));
                    break;
                case "title":
                    onTitleRef.current?.(event.title);
                    break;
            }
        };

        source.onerror = () => {
            // EventSource auto-reconnects; nothing to do. Clear stale "responding" state.
            setRespondingFor(null);
        };

        return () => {
            source.close();
            for (const t of timers.values()) clearTimeout(t);
            timers.clear();
            setViewers([]);
            setTypingUsers([]);
            setRespondingFor(null);
        };
    }, [chatId, enabled, currentUserId, clearTyping]);

    // Resolve the name of the user the AI is responding to (for the indicator label).
    const respondingName =
        respondingFor
            ? (participants.find((p) => p.userId === respondingFor)?.name ?? "a teammate")
            : null;

    return { viewers, typingUsers, respondingName };
}
