/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Square, Check, ChevronDown, AlertCircle, GitCompare, Trophy, RotateCcw } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";

interface AllowedModel {
    id: string;
    name: string;
}

const MAX_MODELS = 3;
const MIN_MODELS = 2;

// One model column carries its own assistant response per shared user turn.
interface ColumnTurn {
    text: string;
    streaming: boolean;
    error: string | null;
    elapsedMs: number | null;
    startedAt: number | null;
}

interface CompareViewProps {
    allowedModels: AllowedModel[];
    onClose: () => void;
    initialPrompt?: string;
}

// Rough token estimate (~4 chars/token) — good enough for a relative side-by-side.
function approxTokens(text: string): number {
    return Math.max(0, Math.round(text.length / 4));
}

function modelName(allowed: AllowedModel[], id: string): string {
    return allowed.find((m) => m.id === id)?.name ?? id;
}

export function CompareView({ allowedModels, onClose, initialPrompt = "" }: CompareViewProps) {
    // Default to the first two allowed models.
    const [selectedModels, setSelectedModels] = useState<string[]>(() =>
        allowedModels.slice(0, MIN_MODELS).map((m) => m.id)
    );
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [input, setInput] = useState(initialPrompt);

    // Shared user prompts across all columns (each compare turn).
    const [userTurns, setUserTurns] = useState<string[]>([]);
    // responses[modelId][turnIndex] -> ColumnTurn
    const [responses, setResponses] = useState<Record<string, ColumnTurn[]>>({});
    const [busy, setBusy] = useState(false);

    const abortRef = useRef<AbortController | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [responses, userTurns]);

    // Tick to keep elapsed timers live while streaming.
    const [, forceTick] = useState(0);
    useEffect(() => {
        if (!busy) return;
        const id = setInterval(() => forceTick((n) => n + 1), 200);
        return () => clearInterval(id);
    }, [busy]);

    const toggleModel = (id: string) => {
        setSelectedModels((prev) => {
            if (prev.includes(id)) {
                if (prev.length <= MIN_MODELS) return prev; // keep at least 2
                return prev.filter((m) => m !== id);
            }
            if (prev.length >= MAX_MODELS) return prev; // cap at 3
            return [...prev, id];
        });
    };

    const streamOne = useCallback(
        async (
            modelId: string,
            messages: { role: string; content: string }[],
            turnIndex: number,
            signal: AbortSignal
        ) => {
            const start = Date.now();
            const writeTurn = (patch: Partial<ColumnTurn>) => {
                setResponses((prev) => {
                    const col = [...(prev[modelId] ?? [])];
                    col[turnIndex] = { ...col[turnIndex], ...patch };
                    return { ...prev, [modelId]: col };
                });
            };
            try {
                const res = await fetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    // chatId null + incognito => nothing persisted, no memory injected.
                    // Pure ephemeral comparison run against the shared multi-model gate.
                    body: JSON.stringify({
                        messages,
                        chatId: null,
                        selectedModel: modelId,
                        incognito: true,
                    }),
                    signal,
                });
                if (!res.ok || !res.body) {
                    const errText = await res.text().catch(() => "");
                    writeTurn({ streaming: false, error: errText || `Request failed (${res.status})`, elapsedMs: Date.now() - start });
                    return;
                }
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let acc = "";
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    acc += decoder.decode(value, { stream: true });
                    writeTurn({ text: acc, elapsedMs: Date.now() - start });
                }
                writeTurn({ text: acc, streaming: false, elapsedMs: Date.now() - start });
            } catch (err: any) {
                if (signal.aborted) {
                    writeTurn({ streaming: false, elapsedMs: Date.now() - start });
                } else {
                    writeTurn({ streaming: false, error: String(err?.message ?? err), elapsedMs: Date.now() - start });
                }
            }
        },
        []
    );

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if (!text || busy || selectedModels.length < MIN_MODELS) return;

        const turnIndex = userTurns.length;
        setInput("");
        setUserTurns((prev) => [...prev, text]);

        // Seed an empty streaming turn for every column and build each column's
        // own message history (shared user turns + that model's prior answers).
        const histories: Record<string, { role: string; content: string }[]> = {};
        setResponses((prev) => {
            const next: Record<string, ColumnTurn[]> = { ...prev };
            for (const modelId of selectedModels) {
                const priorTurns = prev[modelId] ?? [];
                const history: { role: string; content: string }[] = [];
                for (let i = 0; i < turnIndex; i++) {
                    history.push({ role: "user", content: userTurns[i] });
                    const ans = priorTurns[i];
                    if (ans && !ans.error) history.push({ role: "assistant", content: ans.text });
                }
                history.push({ role: "user", content: text });
                histories[modelId] = history;

                const col = [...priorTurns];
                col[turnIndex] = { text: "", streaming: true, error: null, elapsedMs: null, startedAt: Date.now() };
                next[modelId] = col;
            }
            return next;
        });

        setBusy(true);
        const controller = new AbortController();
        abortRef.current = controller;
        await Promise.all(
            selectedModels.map((modelId) =>
                streamOne(modelId, histories[modelId], turnIndex, controller.signal)
            )
        );
        setBusy(false);
        abortRef.current = null;
    }, [input, busy, selectedModels, userTurns, streamOne]);

    const handleStop = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setBusy(false);
    };

    const handleReset = () => {
        handleStop();
        setUserTurns([]);
        setResponses({});
    };

    const gridCols =
        selectedModels.length >= 3 ? "lg:grid-cols-3" : selectedModels.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1";

    return (
        <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <GitCompare size={18} className="text-blue-400 shrink-0" />
                    <h2 className="text-sm font-semibold text-white shrink-0">Compare models</h2>
                    {/* Model picker */}
                    <div className="relative ml-2" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => setShowModelPicker((v) => !v)}
                            disabled={busy}
                            className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span>{selectedModels.length} models</span>
                            <ChevronDown size={12} className={`transition-transform ${showModelPicker ? "rotate-180" : ""}`} />
                        </button>
                        {showModelPicker && (
                            <div className="absolute top-full mt-1 left-0 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-56 max-w-72 z-10 max-h-80 overflow-y-auto">
                                <p className="px-3 py-2 text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-700 sticky top-0 bg-gray-800">
                                    Pick {MIN_MODELS}–{MAX_MODELS} models
                                </p>
                                {allowedModels.map((m) => {
                                    const active = selectedModels.includes(m.id);
                                    const atCap = !active && selectedModels.length >= MAX_MODELS;
                                    const atFloor = active && selectedModels.length <= MIN_MODELS;
                                    return (
                                        <button
                                            key={m.id}
                                            type="button"
                                            disabled={atCap || atFloor}
                                            onClick={() => toggleModel(m.id)}
                                            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${active ? "bg-blue-600 border-blue-600" : "border-gray-600"}`}>
                                                {active && <Check size={10} className="text-white" />}
                                            </div>
                                            <span className="flex-1 text-left truncate">{m.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    {userTurns.length > 0 && (
                        <button
                            type="button"
                            onClick={handleReset}
                            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                        >
                            <RotateCcw size={13} /> Reset
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        title="Close compare"
                        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Column headers */}
            <div className={`grid grid-cols-1 ${gridCols} gap-px bg-gray-800 border-b border-gray-800 shrink-0`}>
                {selectedModels.map((id) => (
                    <div key={id} className="bg-gray-900 px-4 py-2.5 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <span className="text-sm font-medium text-gray-200 truncate">{modelName(allowedModels, id)}</span>
                    </div>
                ))}
            </div>

            {/* Transcript */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
                {userTurns.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6">
                        <GitCompare size={40} className="text-gray-700 mb-4" />
                        <h3 className="text-lg font-semibold text-gray-400 mb-1.5">Side-by-side comparison</h3>
                        <p className="text-sm text-gray-600 max-w-md">
                            Send one prompt to {selectedModels.length} models at once and compare their answers,
                            speed, and length. These runs are not saved to your history.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {userTurns.map((prompt, turnIdx) => {
                            // Determine fastest finished column for a small "winner" badge.
                            const finished = selectedModels
                                .map((id) => ({ id, t: responses[id]?.[turnIdx] }))
                                .filter((c) => c.t && !c.t.streaming && !c.t.error && c.t.elapsedMs != null);
                            const fastestId =
                                finished.length > 1
                                    ? finished.reduce((a, b) => ((a.t!.elapsedMs ?? Infinity) <= (b.t!.elapsedMs ?? Infinity) ? a : b)).id
                                    : null;
                            return (
                                <div key={turnIdx}>
                                    {/* Shared user prompt */}
                                    <div className="px-4 py-3 bg-gray-900/60">
                                        <div className="max-w-3xl mx-auto">
                                            <span className="text-[10px] uppercase tracking-wider text-gray-500">You</span>
                                            <p className="text-sm text-gray-200 whitespace-pre-wrap mt-0.5">{prompt}</p>
                                        </div>
                                    </div>
                                    {/* Per-model answers */}
                                    <div className={`grid grid-cols-1 ${gridCols} gap-px bg-gray-800`}>
                                        {selectedModels.map((id) => {
                                            const turn = responses[id]?.[turnIdx];
                                            return (
                                                <div key={id} className="bg-gray-900 px-4 py-4 min-w-0">
                                                    {/* Per-cell stats */}
                                                    <div className="flex items-center gap-2 mb-2 text-[11px] text-gray-500">
                                                        {turn?.streaming && (
                                                            <span className="flex items-center gap-1 text-blue-400">
                                                                <span className="inline-flex gap-0.5">
                                                                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                                                                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                                                                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                                                                </span>
                                                            </span>
                                                        )}
                                                        {turn?.elapsedMs != null && (
                                                            <span>{(turn.elapsedMs / 1000).toFixed(1)}s</span>
                                                        )}
                                                        {turn && !turn.error && turn.text && (
                                                            <span>· ~{approxTokens(turn.text)} tok</span>
                                                        )}
                                                        {fastestId === id && (
                                                            <span className="flex items-center gap-1 text-amber-400 ml-auto">
                                                                <Trophy size={11} /> fastest
                                                            </span>
                                                        )}
                                                    </div>
                                                    {turn?.error ? (
                                                        <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
                                                            <AlertCircle size={15} className="shrink-0 mt-0.5" />
                                                            <span className="break-words">{turn.error}</span>
                                                        </div>
                                                    ) : turn?.text ? (
                                                        <div
                                                            className="prose-chat text-sm text-gray-200 leading-relaxed break-words [&_pre]:overflow-x-auto [&_pre]:bg-gray-800 [&_pre]:p-3 [&_pre]:rounded-lg [&_code]:text-[13px] [&_a]:text-blue-400 [&_a]:underline [&_h1]:text-base [&_h2]:text-sm [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full [&_img]:rounded-lg space-y-2"
                                                            dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.text) }}
                                                        />
                                                    ) : (
                                                        <span className="text-sm text-gray-600">—</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Composer */}
            <div className="border-t border-gray-800 p-4 shrink-0">
                <div className="max-w-3xl mx-auto flex gap-2 items-end">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        rows={1}
                        placeholder={
                            selectedModels.length < MIN_MODELS
                                ? "Select at least 2 models…"
                                : "Send one prompt to all selected models…"
                        }
                        maxLength={4000}
                        className="flex-1 resize-none max-h-40 p-3.5 rounded-xl bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500 text-sm"
                    />
                    {busy ? (
                        <button
                            type="button"
                            onClick={handleStop}
                            title="Stop"
                            className="shrink-0 aspect-square h-[50px] flex items-center justify-center bg-red-600 rounded-xl hover:bg-red-700 transition-colors"
                        >
                            <Square size={18} fill="currentColor" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleSend}
                            disabled={!input.trim() || selectedModels.length < MIN_MODELS}
                            className="shrink-0 aspect-square h-[50px] flex items-center justify-center bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Send size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
