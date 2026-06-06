"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Bot, GripVertical, X, Zap, Shield, Users } from "lucide-react";
import { saveModelConfig, saveRateLimit, saveMultiModelConfig } from "@/app/admin/actions";
import { useToast } from "@/components/providers/toast-provider";
import type { ProviderName } from "@/lib/ai-providers";

interface ModelItem {
    id: string;
    name: string;
    pricing?: { prompt?: string; completion?: string };
    provider?: ProviderName;
}

interface Props {
    models: ModelItem[];
    savedDefault: string;
    savedFallbacks: string[];
    hasApiKey: boolean;
    rateLimitPerDay: number;
    multiModelEnabled: boolean;
    allowedModels: string[];
}

function isFree(m: ModelItem) {
    if (m.provider && m.provider !== "openrouter") return false;
    return (
        parseFloat(m?.pricing?.prompt ?? "1") === 0 &&
        parseFloat(m?.pricing?.completion ?? "1") === 0
    );
}

const PROVIDER_STYLES: Record<string, { label: string; cls: string }> = {
    openrouter: { label: "OpenRouter", cls: "bg-blue-500/20 text-blue-400" },
    openai:     { label: "OpenAI",     cls: "bg-green-500/20 text-green-400" },
    anthropic:  { label: "Anthropic",  cls: "bg-orange-500/20 text-orange-400" },
    deepseek:   { label: "DeepSeek",   cls: "bg-purple-500/20 text-purple-400" },
    qwen:       { label: "Qwen",       cls: "bg-teal-500/20 text-teal-400" },
};

function ProviderBadge({ provider }: { provider?: string }) {
    const style = PROVIDER_STYLES[provider ?? "openrouter"] ?? PROVIDER_STYLES.openrouter;
    return (
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${style.cls}`}>
            {style.label}
        </span>
    );
}

function ModelBadge({ m }: { m: ModelItem }) {
    if (m.provider && m.provider !== "openrouter") return <ProviderBadge provider={m.provider} />;
    return isFree(m) ? (
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium shrink-0">Free</span>
    ) : (
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-medium shrink-0">Paid</span>
    );
}

function FallbackDragList({
    order,
    models,
    onReorder,
    onRemove,
}: {
    order: string[];
    models: ModelItem[];
    onReorder: (next: string[]) => void;
    onRemove: (id: string) => void;
}) {
    const dragFrom = useRef<number | null>(null);
    const [dragOver, setDragOver] = useState<number | null>(null);

    const handleDragStart = (i: number) => { dragFrom.current = i; };

    const handleDragOver = (e: React.DragEvent, i: number) => {
        e.preventDefault();
        setDragOver(i);
        const from = dragFrom.current;
        if (from === null || from === i) return;
        const next = [...order];
        const [item] = next.splice(from, 1);
        next.splice(i, 0, item);
        dragFrom.current = i;
        onReorder(next);
    };

    const handleDragEnd = () => {
        dragFrom.current = null;
        setDragOver(null);
    };

    if (order.length === 0) {
        return (
            <p className="text-sm text-gray-600 italic py-2">
                None — check a model above to add one.
            </p>
        );
    }

    return (
        <div className="space-y-1.5">
            {order.map((id, i) => {
                const m = models.find((x) => x.id === id);
                return (
                    <div
                        key={id}
                        draggable
                        onDragStart={() => handleDragStart(i)}
                        onDragOver={(e) => handleDragOver(e, i)}
                        onDragEnd={handleDragEnd}
                        className={`flex items-center gap-2 bg-gray-950 border rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing transition-colors select-none ${
                            dragOver === i ? "border-blue-500 bg-blue-500/5" : "border-gray-700"
                        }`}
                    >
                        {/* hidden input — order matters, submitted in DOM order */}
                        <input type="hidden" name="fallbackModels" value={id} />
                        <GripVertical size={14} className="text-gray-600 shrink-0" />
                        <span className="text-xs text-gray-600 w-4 shrink-0 text-right">{i + 1}</span>
                        <span className="text-sm text-gray-300 flex-1 truncate">{m?.name || id}</span>
                        {m && <ModelBadge m={m} />}
                        <button
                            type="button"
                            onClick={() => onRemove(id)}
                            className="text-gray-600 hover:text-red-400 transition-colors ml-1 shrink-0"
                            title="Remove from fallback"
                        >
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

export function ModelsTab({ models, savedDefault, savedFallbacks, hasApiKey, rateLimitPerDay, multiModelEnabled, allowedModels }: Props) {
    const { toast } = useToast();
    const findModel = (id: string) => models.find((m) => m.id === id);

    const [modelState, modelFormAction, modelPending] = useActionState(saveModelConfig, null);
    const [rateState, rateFormAction, ratePending] = useActionState(saveRateLimit, null);
    const [multiModelState, multiModelFormAction, multiModelPending] = useActionState(saveMultiModelConfig, null);

    const [fallbackOrder, setFallbackOrder] = useState<string[]>(savedFallbacks);
    const [multiModelEnabledState, setMultiModelEnabledState] = useState(multiModelEnabled);
    const [allowedModelsState, setAllowedModelsState] = useState<string[]>(allowedModels);
    const [providerFilter, setProviderFilter] = useState<string>("all");
    const [search, setSearch] = useState("");

    const availableProviders = Array.from(new Set(models.map((m) => m.provider ?? "openrouter")));
    const filteredModels = models.filter((m) => {
        const matchProvider = providerFilter === "all" || (m.provider ?? "openrouter") === providerFilter;
        const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase());
        return matchProvider && matchSearch;
    });

    useEffect(() => {
        if (!modelState) return;
        toast(modelState.message, modelState.ok ? "success" : "error");
        if (modelState.ok) setFallbackOrder(savedFallbacks);
    }, [modelState]);

    useEffect(() => {
        if (!rateState) return;
        toast(rateState.message, rateState.ok ? "success" : "error");
    }, [rateState]);

    useEffect(() => {
        if (!multiModelState) return;
        toast(multiModelState.message, multiModelState.ok ? "success" : "error");
    }, [multiModelState]);

    const toggleFallback = (id: string) => {
        setFallbackOrder((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const toggleAllowedModel = (id: string) => {
        setAllowedModelsState((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    return (
        <div className="space-y-6">
            {!hasApiKey && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-600/30 rounded-xl text-yellow-400 text-sm">
                    API Key not configured. Enter it in the{" "}
                    <a href="/admin?tab=apikeys" className="underline font-medium">API Keys</a> tab first.
                </div>
            )}

            {/* Row 1 — 2 columns */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* Konfigurasi Aktif */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-gray-800">
                        <h2 className="font-semibold flex items-center gap-2 text-sm">
                            <Zap size={16} className="text-blue-400" /> Active Configuration
                        </h2>
                    </div>
                    <div className="p-5 space-y-5 flex-1">
                        <div>
                            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Model Default</p>
                            {savedDefault ? (() => {
                                const m = findModel(savedDefault);
                                return (
                                    <div className="flex items-center gap-2.5 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
                                        <Bot size={16} className="text-blue-400 shrink-0" />
                                        <span className="text-sm font-medium flex-1 truncate">{m?.name || savedDefault}</span>
                                        {m && <ModelBadge m={m} />}
                                    </div>
                                );
                            })() : (
                                <p className="text-sm text-gray-600 italic">Not configured</p>
                            )}
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">
                                Model Fallback ({savedFallbacks.length})
                            </p>
                            {savedFallbacks.length === 0 ? (
                                <p className="text-sm text-gray-600 italic">None</p>
                            ) : (
                                <div className="space-y-2">
                                    {savedFallbacks.map((id, i) => {
                                        const m = findModel(id);
                                        return (
                                            <div key={id} className="flex items-center gap-2.5 bg-gray-800/60 border border-gray-700/60 rounded-lg px-4 py-2.5">
                                                <span className="text-xs text-gray-600 w-4 shrink-0">{i + 1}</span>
                                                <span className="text-sm text-gray-300 flex-1 truncate">{m?.name || id}</span>
                                                {m && <ModelBadge m={m} />}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Ubah Konfigurasi Model */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-gray-800">
                        <h2 className="font-semibold flex items-center gap-2">
                            <Bot size={18} className="text-blue-400" /> Edit Model Configuration
                        </h2>
                    </div>
                    <form action={modelFormAction} className="p-5 space-y-5 flex-1 flex flex-col">
                        {/* Filter bar */}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Search models..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="flex-1 p-2 text-sm bg-gray-950 border border-gray-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                            <select
                                value={providerFilter}
                                onChange={(e) => setProviderFilter(e.target.value)}
                                className="p-2 text-sm bg-gray-950 border border-gray-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none"
                            >
                                <option value="all">All Providers</option>
                                {availableProviders.map((p) => (
                                    <option key={p} value={p}>
                                        {PROVIDER_STYLES[p]?.label ?? p}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block mb-2 text-sm font-medium text-gray-300">Model Default</label>
                            <select
                                name="defaultModel"
                                defaultValue={savedDefault}
                                className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            >
                                <option value="">Select default model...</option>
                                {filteredModels.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        [{PROVIDER_STYLES[m.provider ?? "openrouter"]?.label ?? m.provider}]{isFree(m) ? " [Free]" : ""} {m.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex-1 flex flex-col gap-3">
                            {/* Pilih model */}
                            <div>
                                <label className="block mb-2 text-sm font-medium text-gray-300">
                                    Fallback Models <span className="text-gray-500 font-normal">(check to select)</span>
                                </label>
                                <div className="h-40 overflow-y-auto bg-gray-950 border border-gray-700 rounded-lg p-2 space-y-0.5">
                                    {filteredModels.length === 0 ? (
                                        <p className="text-sm text-gray-500 text-center py-6">
                                            {hasApiKey ? "No models match filter" : "API Key required"}
                                        </p>
                                    ) : (
                                        filteredModels.map((m) => (
                                            <label key={m.id} className="flex items-center gap-3 cursor-pointer px-2 py-1.5 hover:bg-gray-900 rounded-lg">
                                                <input
                                                    type="checkbox"
                                                    checked={fallbackOrder.includes(m.id)}
                                                    onChange={() => toggleFallback(m.id)}
                                                    className="w-4 h-4 rounded accent-blue-500 shrink-0"
                                                />
                                                <span className="text-sm text-gray-300 flex-1 truncate">{m.name}</span>
                                                <ModelBadge m={m} />
                                            </label>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Drag-and-drop urutan */}
                            <div>
                                <p className="text-sm font-medium text-gray-300 mb-2">
                                    Fallback Order
                                    {fallbackOrder.length > 1 && (
                                        <span className="text-gray-500 font-normal ml-1">(drag to reorder)</span>
                                    )}
                                </p>
                                <FallbackDragList
                                    order={fallbackOrder}
                                    models={models}
                                    onReorder={setFallbackOrder}
                                    onRemove={(id) => setFallbackOrder((prev) => prev.filter((x) => x !== id))}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={modelPending}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-3 rounded-lg transition-colors text-sm mt-auto"
                        >
                            {modelPending ? "Saving..." : "Save Model Configuration"}
                        </button>
                    </form>
                </div>
            </div>

            {/* Row 2 — User Model Selection full width */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-gray-800">
                    <h2 className="font-semibold flex items-center gap-2">
                        <Users size={18} className="text-green-400" /> User Model Selection
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">Allow users to choose which AI model to use in their chat.</p>
                </div>
                <form action={multiModelFormAction} className="p-5 space-y-4">
                    {/* Toggle */}
                    <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
                        <div className="relative shrink-0">
                            <input
                                type="checkbox"
                                name="multiModelEnabled"
                                checked={multiModelEnabledState}
                                onChange={(e) => setMultiModelEnabledState(e.target.checked)}
                                className="sr-only"
                            />
                            <div className={`w-10 h-6 rounded-full transition-colors ${multiModelEnabledState ? "bg-green-600" : "bg-gray-700"}`} />
                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${multiModelEnabledState ? "translate-x-4" : ""}`} />
                        </div>
                        <span className="text-sm text-gray-300">Enable user model selection</span>
                    </label>

                    {/* Model list (only when enabled) */}
                    {multiModelEnabledState && (
                        <div>
                            <label className="block mb-2 text-sm font-medium text-gray-300">
                                Available Models for Users{" "}
                                <span className="text-gray-500 font-normal">(check to allow)</span>
                            </label>
                            <div className="h-48 overflow-y-auto bg-gray-950 border border-gray-700 rounded-lg p-2 space-y-0.5">
                                {filteredModels.length === 0 ? (
                                    <p className="text-sm text-gray-500 text-center py-8">
                                        {hasApiKey ? "No models match filter" : "API Key required"}
                                    </p>
                                ) : (
                                    filteredModels.map((m) => (
                                        <label key={m.id} className="flex items-center gap-3 cursor-pointer px-2 py-1.5 hover:bg-gray-900 rounded-lg">
                                            <input
                                                type="checkbox"
                                                name="allowedModels"
                                                value={m.id}
                                                checked={allowedModelsState.includes(m.id)}
                                                onChange={() => toggleAllowedModel(m.id)}
                                                className="w-4 h-4 rounded accent-green-500 shrink-0"
                                            />
                                            <span className="text-sm text-gray-300 flex-1 truncate">{m.name}</span>
                                            <ModelBadge m={m} />
                                        </label>
                                    ))
                                )}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                {allowedModelsState.length} model{allowedModelsState.length !== 1 ? "s" : ""} selected
                            </p>
                        </div>
                    )}

                    <div className="flex items-center gap-4">
                        <button
                            type="submit"
                            disabled={multiModelPending}
                            className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium px-5 py-2.5 rounded-lg transition-colors text-sm"
                        >
                            {multiModelPending ? "Saving..." : "Save"}
                        </button>
                        {multiModelEnabledState && allowedModelsState.length > 0 && (
                            <p className="text-xs text-green-400">
                                Users can choose from {allowedModelsState.length} model{allowedModelsState.length !== 1 ? "s" : ""}.
                            </p>
                        )}
                        {multiModelEnabledState && allowedModelsState.length === 0 && (
                            <p className="text-xs text-yellow-400">Select at least one model for users to choose from.</p>
                        )}
                    </div>
                </form>
            </div>

            {/* Row 3 — Rate Limiting full width */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-gray-800">
                    <h2 className="font-semibold flex items-center gap-2">
                        <Shield size={18} className="text-purple-400" /> Rate Limiting
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">Limit messages per user per day. Set to 0 for no limit.</p>
                </div>
                <form action={rateFormAction} className="p-5">
                    <div className="flex flex-wrap items-end gap-4">
                        <div>
                            <label className="block mb-2 text-sm font-medium text-gray-300">Messages per Day Limit</label>
                            <input
                                type="number"
                                name="rateLimitPerDay"
                                defaultValue={rateLimitPerDay}
                                min={0}
                                max={10000}
                                className="w-36 p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            />
                        </div>
                        <div className="flex items-center gap-4 pb-0.5">
                            <span className="text-sm text-gray-500">messages / day &nbsp;(0 = unlimited)</span>
                            <button
                                type="submit"
                                disabled={ratePending}
                                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-medium px-5 py-3 rounded-lg transition-colors text-sm"
                            >
                                {ratePending ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                    {rateLimitPerDay > 0 && (
                        <p className="text-xs text-yellow-400 mt-3">Active: each user is limited to {rateLimitPerDay} messages per day.</p>
                    )}
                </form>
            </div>
        </div>
    );
}
