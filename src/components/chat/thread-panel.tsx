/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import { X, Send, Square, AlertCircle, RefreshCw, MessageSquare } from "lucide-react";
import type { ChatMessage } from "@/types";

const TYPING_WORDS = ["thinking", "hacking", "baking", "writing", "creating"];

interface ThreadPanelProps {
    chatId: string;
    parentMessage: ChatMessage;
    onClose: () => void;
    onReplyCountChange?: (messageId: string, count: number) => void;
    isGuest?: boolean;
    selectedModel?: string;
}

function parseContent(m: { content: string; role: string }): ChatMessage {
    let parts: any[] = [{ type: "text", text: m.content }];
    let content = m.content;
    try {
        const parsed = JSON.parse(m.content);
        if (parsed && typeof parsed === "object" && "text" in parsed) {
            content = parsed.text ?? "";
            parts = [{ type: "text", text: content }];
        }
    } catch { /* plain text */ }
    return { id: crypto.randomUUID(), role: m.role as any, content, parts };
}

export function ThreadPanel({ chatId, parentMessage, onClose, onReplyCountChange, isGuest, selectedModel }: ThreadPanelProps) {
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);
    const parentMessageIdRef = useRef(parentMessage.id);
    const selectedModelRef = useRef(selectedModel ?? "");
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        selectedModelRef.current = selectedModel ?? "";
    }, [selectedModel]);

    const transport = useRef(
        new TextStreamChatTransport({
            api: "/api/chat",
            body: () => ({
                chatId,
                parentMessageId: parentMessageIdRef.current,
                selectedModel: selectedModelRef.current,
            }),
        })
    );

    const { messages, sendMessage, setMessages, status, error, clearError, stop } = useChat({
        transport: transport.current,
        messages: [parentMessage] as any,
    } as any);

    const isStreaming = status === "streaming" || status === "submitted";
    const lastIsUser = messages.length > 0 && messages[messages.length - 1].role === "user";
    const showTyping = isStreaming && lastIsUser;

    const [typingWordIdx, setTypingWordIdx] = useState(0);
    useEffect(() => {
        if (!showTyping) return;
        const id = setInterval(() => setTypingWordIdx(i => (i + 1) % TYPING_WORDS.length), 1800);
        return () => clearInterval(id);
    }, [showTyping]);

    // Load existing replies on mount
    useEffect(() => {
        setLoading(true);
        fetch(`/api/chats/${chatId}/messages/${parentMessage.id}/replies`)
            .then((r) => r.json())
            .then((data) => {
                if (data.replies && data.replies.length > 0) {
                    const converted: ChatMessage[] = data.replies.map(parseContent);
                    // Prepend parent then replies as initial thread context
                    (setMessages as any)([parentMessage, ...converted]);
                }
            })
            .catch(() => setFetchError(true))
            .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatId, parentMessage.id]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, status]);

    // After a reply is sent, notify parent of new count (replies = messages length - 1 for parent)
    const prevMsgCount = useRef(messages.length);
    useEffect(() => {
        if (messages.length > prevMsgCount.current && !isStreaming) {
            const replyCount = messages.length - 1; // subtract the parent message
            onReplyCountChange?.(parentMessage.id, replyCount);
        }
        prevMsgCount.current = messages.length;
    }, [messages.length, isStreaming, parentMessage.id, onReplyCountChange]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const text = input.trim();
        if (!text || isStreaming || isGuest) return;
        if (error) clearError();
        setInput("");
        sendMessage({ role: "user", parts: [{ type: "text", text }] });
    };

    const getText = (m: ChatMessage): string => {
        if (Array.isArray(m.parts)) return m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("");
        return m.content ?? "";
    };

    // messages[0] is the parent — display it as the thread root, replies start at index 1
    const parentMsg = messages[0] as ChatMessage;
    const replies = messages.slice(1) as ChatMessage[];

    return (
        <div className="flex flex-col h-full border-l border-gray-700 bg-gray-900 w-80 lg:w-96 shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
                    <MessageSquare size={15} className="text-blue-400" />
                    Thread
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                >
                    <X size={15} />
                </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Parent message — always shown at top */}
                <div className="p-3 rounded-xl bg-gray-800/60 border border-gray-700">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 block">
                        {parentMsg?.role === "user" ? "You" : "Assistant"}
                    </span>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {parentMsg ? getText(parentMsg) : getText(parentMessage)}
                    </p>
                </div>

                <div className="flex items-center gap-2 py-1">
                    <div className="flex-1 h-px bg-gray-700" />
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider shrink-0">
                        {replies.length} {replies.length === 1 ? "reply" : "replies"}
                    </span>
                    <div className="flex-1 h-px bg-gray-700" />
                </div>

                {loading && (
                    <p className="text-xs text-gray-500 text-center py-4 animate-pulse">Loading replies...</p>
                )}

                {fetchError && !loading && (
                    <p className="text-xs text-red-400 text-center py-4">Failed to load replies</p>
                )}

                {!loading && replies.map((m, i) => {
                    const isUser = m.role === "user";
                    return (
                        <div key={m.id ?? i} className={`flex flex-col gap-0.5 ${isUser ? "items-end" : "items-start"}`}>
                            <span className="text-[10px] text-gray-500 px-1">
                                {isUser ? "You" : "Assistant"}
                            </span>
                            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                                isUser
                                    ? "bg-blue-600 text-white rounded-br-sm"
                                    : "bg-gray-800 text-gray-100 rounded-bl-sm"
                            }`}>
                                {getText(m)}
                            </div>
                        </div>
                    );
                })}

                {showTyping && (
                    <div className="flex items-start gap-2">
                        <div className="px-3 py-2 rounded-xl bg-gray-800 text-sm flex items-center gap-1">
                            <span className="text-gray-300 capitalize">{TYPING_WORDS[typingWordIdx]}</span>
                            <span className="inline-flex gap-0.5 text-gray-500">
                                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                            </span>
                        </div>
                    </div>
                )}

                {status === "error" && error && (
                    <div className="flex gap-2 items-start p-3 rounded-xl bg-red-950 border border-red-900">
                        <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs text-red-400 mb-1">{error.message}</p>
                            <button
                                onClick={() => clearError()}
                                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                            >
                                <RefreshCw size={10} /> Dismiss
                            </button>
                        </div>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 p-3 border-t border-gray-700">
                {isGuest ? (
                    <p className="text-xs text-gray-500 text-center py-2">Sign in to reply in threads</p>
                ) : (
                    <form onSubmit={handleSubmit} className="flex gap-2 relative">
                        <input
                            className="flex-1 px-3 py-2.5 pr-11 rounded-xl bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-white placeholder-gray-500 disabled:opacity-50"
                            value={input}
                            disabled={isStreaming}
                            placeholder="Reply in thread..."
                            maxLength={4000}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && (!e.shiftKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    handleSubmit(e as unknown as React.FormEvent);
                                }
                            }}
                        />
                        {isStreaming ? (
                            <button
                                type="button"
                                onClick={stop}
                                className="absolute right-2 top-1.5 bottom-1.5 aspect-square flex items-center justify-center bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                            >
                                <Square size={13} fill="currentColor" />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={!input.trim() || isStreaming}
                                className="absolute right-2 top-1.5 bottom-1.5 aspect-square flex items-center justify-center bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Send size={14} />
                            </button>
                        )}
                    </form>
                )}
            </div>
        </div>
    );
}
