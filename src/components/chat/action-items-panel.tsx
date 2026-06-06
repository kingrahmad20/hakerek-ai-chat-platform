"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Sparkles, CheckSquare, Square, Trash2, ListTodo, AlertCircle, Loader2, CheckCheck } from "lucide-react";

interface ActionItem {
    id: string;
    text: string;
    type: "task" | "decision";
    completed: boolean;
    createdAt: string;
}

interface ExtractedItem {
    text: string;
    type: "task" | "decision";
    saving?: boolean;
    saved?: boolean;
}

interface ActionItemsPanelProps {
    chatId: string;
    onClose: () => void;
}

export function ActionItemsPanel({ chatId, onClose }: ActionItemsPanelProps) {
    const [saved, setSaved] = useState<ActionItem[]>([]);
    const [extracted, setExtracted] = useState<ExtractedItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(true);
    const [extracting, setExtracting] = useState(false);
    const [extractError, setExtractError] = useState<string | null>(null);

    const loadSaved = useCallback(async () => {
        setLoadingItems(true);
        try {
            const res = await fetch(`/api/chats/${chatId}/action-items`);
            if (res.ok) {
                const data = await res.json();
                setSaved(data.items ?? []);
            }
        } finally {
            setLoadingItems(false);
        }
    }, [chatId]);

    useEffect(() => {
        loadSaved();
    }, [loadSaved]);

    const handleExtract = async () => {
        setExtracting(true);
        setExtractError(null);
        setExtracted([]);
        try {
            const res = await fetch(`/api/chats/${chatId}/extract-action-items`, { method: "POST" });
            const data = await res.json();
            if (!res.ok) {
                setExtractError(data.error ?? "Extraction failed");
                return;
            }
            if (!data.items || data.items.length === 0) {
                setExtractError("No action items or decisions detected in this conversation.");
                return;
            }
            setExtracted(data.items.map((item: ExtractedItem) => ({ ...item, saving: false, saved: false })));
        } catch {
            setExtractError("Failed to connect to server.");
        } finally {
            setExtracting(false);
        }
    };

    const saveExtracted = async (index: number) => {
        const item = extracted[index];
        if (item.saving || item.saved) return;

        setExtracted((prev) => prev.map((e, i) => i === index ? { ...e, saving: true } : e));

        try {
            const res = await fetch(`/api/chats/${chatId}/action-items`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: item.text, type: item.type }),
            });
            if (res.ok) {
                const data = await res.json();
                setSaved((prev) => [...prev, data.item]);
                setExtracted((prev) => prev.map((e, i) => i === index ? { ...e, saving: false, saved: true } : e));
            }
        } catch {
            setExtracted((prev) => prev.map((e, i) => i === index ? { ...e, saving: false } : e));
        }
    };

    const saveAll = async () => {
        const unsaved = extracted
            .map((e, i) => ({ ...e, i }))
            .filter((e) => !e.saved && !e.saving);
        for (const item of unsaved) {
            await saveExtracted(item.i);
        }
    };

    const toggleCompleted = async (id: string, completed: boolean) => {
        setSaved((prev) => prev.map((item) => item.id === id ? { ...item, completed } : item));
        await fetch(`/api/chats/${chatId}/action-items/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completed }),
        });
    };

    const deleteItem = async (id: string) => {
        setSaved((prev) => prev.filter((item) => item.id !== id));
        await fetch(`/api/chats/${chatId}/action-items/${id}`, { method: "DELETE" });
    };

    const completedCount = saved.filter((i) => i.completed).length;
    const hasUnsaved = extracted.some((e) => !e.saved);

    return (
        <div className="flex flex-col h-full border-l border-gray-700 bg-gray-900 w-80 lg:w-96 shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
                    <ListTodo size={15} className="text-violet-400" />
                    Action Items
                    {saved.length > 0 && (
                        <span className="text-xs text-gray-500 font-normal">
                            {completedCount}/{saved.length}
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                >
                    <X size={15} />
                </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Extract button */}
                <button
                    onClick={handleExtract}
                    disabled={extracting}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                    {extracting ? (
                        <><Loader2 size={14} className="animate-spin" /> Detecting...</>
                    ) : (
                        <><Sparkles size={14} /> Detect from Chat</>
                    )}
                </button>

                {extractError && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-950 border border-red-900">
                        <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-400">{extractError}</p>
                    </div>
                )}

                {/* Extracted items (pending review) */}
                {extracted.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Detected</p>
                            {hasUnsaved && (
                                <button
                                    onClick={saveAll}
                                    className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
                                >
                                    <CheckCheck size={11} /> Save all
                                </button>
                            )}
                        </div>
                        {extracted.map((item, i) => (
                            <div
                                key={i}
                                className={`p-3 rounded-xl border text-sm transition-colors ${
                                    item.saved
                                        ? "border-gray-700 bg-gray-800/30 opacity-50"
                                        : "border-gray-700 bg-gray-800/60"
                                }`}
                            >
                                <div className="flex items-start gap-2">
                                    <span className={`shrink-0 mt-0.5 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                                        item.type === "decision"
                                            ? "bg-amber-900/50 text-amber-400"
                                            : "bg-blue-900/50 text-blue-400"
                                    }`}>
                                        {item.type}
                                    </span>
                                    <p className="flex-1 text-gray-200 leading-relaxed">{item.text}</p>
                                </div>
                                {!item.saved && (
                                    <button
                                        onClick={() => saveExtracted(i)}
                                        disabled={item.saving}
                                        className="mt-2 ml-auto flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50 transition-colors"
                                    >
                                        {item.saving ? <Loader2 size={10} className="animate-spin" /> : <CheckSquare size={10} />}
                                        {item.saving ? "Saving..." : "Save"}
                                    </button>
                                )}
                                {item.saved && (
                                    <p className="mt-1.5 text-[11px] text-gray-500 ml-auto text-right">Saved</p>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Saved items */}
                <div className="space-y-2">
                    {saved.length > 0 && (
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Saved</p>
                    )}
                    {loadingItems && (
                        <p className="text-xs text-gray-500 text-center py-4 animate-pulse">Loading...</p>
                    )}
                    {!loadingItems && saved.length === 0 && extracted.length === 0 && (
                        <div className="text-center py-8 space-y-2">
                            <ListTodo size={28} className="mx-auto text-gray-700" />
                            <p className="text-xs text-gray-500">No action items saved yet.</p>
                            <p className="text-xs text-gray-600">Click &quot;Detect from Chat&quot; to extract tasks and decisions.</p>
                        </div>
                    )}
                    {saved.map((item) => (
                        <div
                            key={item.id}
                            className={`flex items-start gap-2.5 p-3 rounded-xl border transition-colors group ${
                                item.completed
                                    ? "border-gray-800 bg-gray-800/20"
                                    : "border-gray-700 bg-gray-800/40 hover:bg-gray-800/60"
                            }`}
                        >
                            <button
                                onClick={() => toggleCompleted(item.id, !item.completed)}
                                className="shrink-0 mt-0.5 text-gray-500 hover:text-violet-400 transition-colors"
                            >
                                {item.completed
                                    ? <CheckSquare size={15} className="text-violet-400" />
                                    : <Square size={15} />
                                }
                            </button>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                                        item.type === "decision"
                                            ? "bg-amber-900/50 text-amber-400"
                                            : "bg-blue-900/50 text-blue-400"
                                    }`}>
                                        {item.type}
                                    </span>
                                </div>
                                <p className={`text-sm leading-relaxed ${item.completed ? "line-through text-gray-500" : "text-gray-200"}`}>
                                    {item.text}
                                </p>
                            </div>
                            <button
                                onClick={() => deleteItem(item.id)}
                                className="shrink-0 opacity-0 group-hover:opacity-100 p-1 text-gray-600 hover:text-red-400 transition-all"
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
