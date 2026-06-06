/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useState, useEffect, useRef } from "react";
import { Send, Bot, Loader2 } from "lucide-react";

interface WidgetConfig {
    enabled: boolean;
    title: string;
    color: string;
    position: string;
    botName: string;
    welcomeMessage: string;
}

export default function WidgetPage() {
    const [config, setConfig] = useState<WidgetConfig | null>(null);
    const [configError, setConfigError] = useState(false);
    const [input, setInput] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const transport = useRef(
        new TextStreamChatTransport({ api: "/api/widget/chat" })
    );

    const { messages, sendMessage, status, error } = useChat({
        transport: transport.current,
    } as any);

    const isStreaming = status === "streaming" || status === "submitted";

    const TYPING_WORDS = ["thinking", "hacking", "baking", "writing", "creating"];
    const [typingWordIdx, setTypingWordIdx] = useState(0);
    const showTypingIndicator = isStreaming && (messages as any[]).at(-1)?.role !== "assistant";
    useEffect(() => {
        if (!showTypingIndicator) return;
        const id = setInterval(() => setTypingWordIdx(i => (i + 1) % TYPING_WORDS.length), 1800);
        return () => clearInterval(id);
    }, [showTypingIndicator]);

    useEffect(() => {
        fetch("/api/widget/config")
            .then((r) => r.json())
            .then((data: WidgetConfig) => {
                if (!data.enabled) setConfigError(true);
                else setConfig(data);
            })
            .catch(() => setConfigError(true));
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isStreaming]);

    const handleSend = () => {
        const text = input.trim();
        if (!text || isStreaming) return;
        setInput("");
        sendMessage({ role: "user", content: text } as any);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (configError) {
        return (
            <div className="h-dvh flex items-center justify-center bg-white dark:bg-gray-950 text-gray-400 text-sm p-6 text-center">
                Chat widget is not enabled.
            </div>
        );
    }

    if (!config) {
        return (
            <div className="h-dvh flex items-center justify-center bg-white dark:bg-gray-950">
                <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
        );
    }

    const accentColor = config.color;

    return (
        <div className="flex flex-col h-dvh bg-white dark:bg-gray-950 text-gray-900 dark:text-white overflow-hidden">
            {/* Header */}
            <div
                className="flex items-center gap-3 px-4 py-3 shrink-0"
                style={{ background: accentColor }}
            >
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <Bot size={16} className="text-white" />
                </div>
                <div className="min-w-0">
                    <div className="font-semibold text-white text-sm leading-tight truncate">
                        {config.botName}
                    </div>
                    <div className="text-white/70 text-xs truncate">{config.title}</div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {/* Welcome message */}
                {config.welcomeMessage && messages.length === 0 && (
                    <div className="flex gap-2 items-end">
                        <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center" style={{ background: accentColor }}>
                            <Bot size={12} className="text-white" />
                        </div>
                        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-3 py-2 text-sm max-w-[85%]">
                            {config.welcomeMessage}
                        </div>
                    </div>
                )}

                {(messages as any[]).map((msg: any) => {
                    const text = typeof msg.content === "string"
                        ? msg.content
                        : Array.isArray(msg.parts)
                            ? msg.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
                            : "";

                    if (msg.role === "user") {
                        return (
                            <div key={msg.id} className="flex justify-end">
                                <div
                                    className="rounded-2xl rounded-br-sm px-3 py-2 text-sm max-w-[85%] text-white whitespace-pre-wrap break-words"
                                    style={{ background: accentColor }}
                                >
                                    {text}
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={msg.id} className="flex gap-2 items-end">
                            <div
                                className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
                                style={{ background: accentColor }}
                            >
                                <Bot size={12} className="text-white" />
                            </div>
                            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap break-words">
                                {text}
                            </div>
                        </div>
                    );
                })}

                {/* Typing indicator */}
                {showTypingIndicator && (
                    <div className="flex gap-2 items-end">
                        <div
                            className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
                            style={{ background: accentColor }}
                        >
                            <Bot size={12} className="text-white" />
                        </div>
                        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-1 text-sm">
                            <span className="text-gray-600 dark:text-gray-300 capitalize">{TYPING_WORDS[typingWordIdx]}</span>
                            <span className="inline-flex gap-0.5 text-gray-400">
                                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                            </span>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="text-center text-xs text-red-400 py-1">
                        Something went wrong. Please try again.
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 px-3 py-3 border-t border-gray-200 dark:border-gray-800">
                <div className="flex gap-2 items-center">
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message…"
                        disabled={isStreaming}
                        className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full px-4 py-2 text-sm outline-none placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-50"
                    />
                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={isStreaming || !input.trim()}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-opacity disabled:opacity-40 shrink-0"
                        style={{ background: accentColor }}
                        aria-label="Send"
                    >
                        {isStreaming ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <Send size={16} />
                        )}
                    </button>
                </div>
                <div className="text-center mt-2 text-gray-400 dark:text-gray-600 text-[10px]">
                    Powered by{" "}
                    <span className="font-medium" style={{ color: accentColor }}>
                        Hakerek
                    </span>
                </div>
            </div>
        </div>
    );
}
