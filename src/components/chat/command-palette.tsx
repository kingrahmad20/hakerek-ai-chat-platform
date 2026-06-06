"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { Search, MessageSquare, Plus, X } from "lucide-react";
import type { ChatSummary } from "@/types";

interface SearchResult {
    chatId: string;
    chatTitle: string;
    snippet: string;
}

export interface PaletteItem {
    id: string;
    icon: React.ReactNode;
    label: string;
    description?: string;
    action: () => void;
}

interface CommandPaletteProps {
    chatList: ChatSummary[];
    onSelectChat: (chatId: string) => void;
    onNewChat: () => void;
    onClose: () => void;
    extraCommands?: PaletteItem[];
}

export function CommandPalette({ chatList, onSelectChat, onNewChat, onClose, extraCommands = [] }: CommandPaletteProps) {
    const [query, setQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        const q = query.trim();
        if (!q) { setSearchResults([]); setSearching(false); return; }
        setSearching(true);
        searchTimerRef.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                const data = await res.json();
                setSearchResults(Array.isArray(data) ? data : []);
            } catch { setSearchResults([]); }
            finally { setSearching(false); }
        }, 300);
        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [query]);

    const q = query.trim().toLowerCase();

    const { actionItems, chatItems } = useMemo(() => {
        const filteredChats = q
            ? chatList.filter(c => (c.title ?? "").toLowerCase().includes(q)).slice(0, 6)
            : chatList.slice(0, 6);

        const actionItems: PaletteItem[] = [
            {
                id: "__new__",
                icon: <Plus size={15} />,
                label: "New Chat",
                description: "Start a fresh conversation",
                action: () => { onNewChat(); onClose(); },
            },
            ...extraCommands.filter(cmd =>
                !q || cmd.label.toLowerCase().includes(q) || (cmd.description ?? "").toLowerCase().includes(q)
            ),
        ];

        const chatItems: PaletteItem[] = [
            ...filteredChats.map(chat => ({
                id: chat.id,
                icon: <MessageSquare size={15} />,
                label: chat.title || "Untitled",
                action: () => { onSelectChat(chat.id); onClose(); },
            })),
            ...(q ? searchResults
                .filter(r => !filteredChats.some(c => c.id === r.chatId))
                .slice(0, 4)
                .map(r => ({
                    id: `sr-${r.chatId}`,
                    icon: <Search size={15} />,
                    label: r.chatTitle || "Untitled",
                    description: r.snippet,
                    action: () => { onSelectChat(r.chatId); onClose(); },
                })) : []),
        ];

        return { actionItems, chatItems };
    }, [q, chatList, extraCommands, searchResults, onNewChat, onClose, onSelectChat]);

    const items: PaletteItem[] = useMemo(() => [...actionItems, ...chatItems], [actionItems, chatItems]);

    useEffect(() => { setSelectedIndex(0); }, [query]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") { onClose(); return; }
            if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, items.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
            if (e.key === "Enter") { e.preventDefault(); items[selectedIndex]?.action(); }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [items, selectedIndex, onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-lg bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
                    <Search size={16} className="text-gray-400 shrink-0" />
                    <input
                        ref={inputRef}
                        className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-sm"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search chats or type a command..."
                    />
                    {query && (
                        <button onClick={() => setQuery("")} className="text-gray-500 hover:text-gray-300 transition-colors">
                            <X size={14} />
                        </button>
                    )}
                    <kbd className="hidden sm:inline px-1.5 py-0.5 text-xs text-gray-500 border border-gray-600 rounded">ESC</kbd>
                </div>

                <div className="max-h-80 overflow-y-auto py-1.5">
                    {searching && (
                        <p className="px-4 py-2 text-xs text-gray-500 animate-pulse">Searching...</p>
                    )}
                    {!searching && items.length === 0 && q && (
                        <p className="px-4 py-6 text-center text-sm text-gray-500">No results for &ldquo;{query}&rdquo;</p>
                    )}
                    {actionItems.length > 0 && (
                        <>
                            <p className="px-4 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">Commands</p>
                            {actionItems.map((item) => {
                                const idx = items.indexOf(item);
                                return (
                                    <button
                                        key={item.id}
                                        onClick={item.action}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                            idx === selectedIndex ? "bg-gray-700 text-white" : "text-gray-300 hover:bg-gray-700/50"
                                        }`}
                                    >
                                        <span className="shrink-0 text-gray-400">{item.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm truncate">{item.label}</p>
                                            {item.description && (
                                                <p className="text-xs text-gray-500 truncate mt-0.5">{item.description}</p>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </>
                    )}
                    {chatItems.length > 0 && (
                        <>
                            <p className={`px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600 ${actionItems.length > 0 ? "pt-2 border-t border-gray-700/60 mt-1" : "pt-1"}`}>
                                {q ? "Chats" : "Recent"}
                            </p>
                            {chatItems.map((item) => {
                                const idx = items.indexOf(item);
                                return (
                                    <button
                                        key={item.id}
                                        onClick={item.action}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                            idx === selectedIndex ? "bg-gray-700 text-white" : "text-gray-300 hover:bg-gray-700/50"
                                        }`}
                                    >
                                        <span className="shrink-0 text-gray-400">{item.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm truncate">{item.label}</p>
                                            {item.description && (
                                                <p className="text-xs text-gray-500 truncate mt-0.5">{item.description}</p>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </>
                    )}
                </div>

                <div className="px-4 py-2 border-t border-gray-700 flex items-center gap-4 text-xs text-gray-600">
                    <span><kbd className="bg-gray-700 px-1 py-0.5 rounded text-gray-400">↑↓</kbd> navigate</span>
                    <span><kbd className="bg-gray-700 px-1 py-0.5 rounded text-gray-400">↵</kbd> select</span>
                    <span><kbd className="bg-gray-700 px-1 py-0.5 rounded text-gray-400">esc</kbd> close</span>
                    <span className="ml-auto"><kbd className="bg-gray-700 px-1 py-0.5 rounded text-gray-400">Ctrl K</kbd> toggle</span>
                </div>
            </div>
        </div>
    );
}
