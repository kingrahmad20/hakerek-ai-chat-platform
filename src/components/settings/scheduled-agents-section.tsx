"use client";
import { useState, useEffect, useCallback } from "react";
import {
    Clock, Plus, Play, Trash2, Loader2, Pencil, Check,
    AlertCircle, CheckCircle, Power, ChevronDown, ChevronRight,
} from "lucide-react";

interface ScheduledAgent {
    id: string;
    name: string;
    prompt: string;
    schedule: string;
    scheduleLabel?: string;
    timezone: string;
    model: string | null;
    enabledTools: string[];
    notify: boolean;
    saveToChat: boolean;
    chatId: string | null;
    active: boolean;
    nextRunAt: string | null;
    lastRunAt: string | null;
    lastStatus: string | null;
    lastError: string | null;
    lastResult: string | null;
    runCount: number;
}

const TOOL_OPTIONS: { id: string; label: string }[] = [
    { id: "web_search", label: "Web Search" },
    { id: "url_fetch", label: "Fetch URL" },
    { id: "calculator", label: "Calculator" },
    { id: "datetime", label: "Date & Time" },
    { id: "generate_image", label: "Generate Image" },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Frequency = "hourly" | "daily" | "weekly" | "monthly" | "custom";

interface DraftSchedule {
    frequency: Frequency;
    minute: number; // for hourly
    time: string; // "HH:MM" for daily/weekly/monthly
    weekday: number; // 0-6
    dom: number; // 1-28
    custom: string;
}

function defaultDraft(): DraftSchedule {
    return { frequency: "daily", minute: 0, time: "09:00", weekday: 1, dom: 1, custom: "0 9 * * *" };
}

/** Build a 5-field cron string from the draft schedule builder. */
function draftToCron(d: DraftSchedule): string {
    const [h, m] = d.time.split(":").map((n) => parseInt(n, 10) || 0);
    switch (d.frequency) {
        case "hourly": return `${d.minute} * * * *`;
        case "daily": return `${m} ${h} * * *`;
        case "weekly": return `${m} ${h} * * ${d.weekday}`;
        case "monthly": return `${m} ${h} ${d.dom} * *`;
        case "custom": return d.custom.trim();
    }
}

/** Best-effort parse of an existing cron string back into the builder. */
function cronToDraft(expr: string): DraftSchedule {
    const d = defaultDraft();
    d.custom = expr;
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) { d.frequency = "custom"; return d; }
    const [min, hour, dom, , dow] = parts;
    const isNum = (s: string) => /^\d+$/.test(s);
    if (hour === "*" && dom === "*" && dow === "*" && isNum(min)) {
        d.frequency = "hourly"; d.minute = parseInt(min, 10);
    } else if (dom === "*" && dow === "*" && isNum(min) && isNum(hour)) {
        d.frequency = "daily"; d.time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
    } else if (dom === "*" && isNum(dow) && isNum(min) && isNum(hour)) {
        d.frequency = "weekly"; d.weekday = parseInt(dow, 10);
        d.time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
    } else if (isNum(dom) && isNum(min) && isNum(hour)) {
        d.frequency = "monthly"; d.dom = parseInt(dom, 10);
        d.time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
    } else {
        d.frequency = "custom";
    }
    return d;
}

function relativeTime(iso: string | null): string {
    if (!iso) return "—";
    const diff = new Date(iso).getTime() - Date.now();
    const abs = Math.abs(diff);
    const mins = Math.round(abs / 60000);
    const fmt = (n: number, unit: string) => `${n} ${unit}${n !== 1 ? "s" : ""}`;
    let label: string;
    if (mins < 60) label = fmt(mins, "min");
    else if (mins < 1440) label = fmt(Math.round(mins / 60), "hour");
    else label = fmt(Math.round(mins / 1440), "day");
    return diff >= 0 ? `in ${label}` : `${label} ago`;
}

const browserTz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
})();

interface FormState {
    name: string;
    prompt: string;
    draft: DraftSchedule;
    model: string;
    tools: Set<string>;
    notify: boolean;
    saveToChat: boolean;
}

function emptyForm(): FormState {
    return {
        name: "", prompt: "", draft: defaultDraft(), model: "",
        tools: new Set(), notify: true, saveToChat: false,
    };
}

function AgentForm({
    initial, onCancel, onSave, saving,
}: {
    initial: FormState;
    onCancel: () => void;
    onSave: (f: FormState) => void;
    saving: boolean;
}) {
    const [form, setForm] = useState<FormState>(initial);
    const cronPreview = draftToCron(form.draft);

    const toggleTool = (id: string) => {
        setForm((f) => {
            const tools = new Set(f.tools);
            if (tools.has(id)) tools.delete(id); else tools.add(id);
            return { ...f, tools };
        });
    };
    const setDraft = (patch: Partial<DraftSchedule>) =>
        setForm((f) => ({ ...f, draft: { ...f.draft, ...patch } }));

    const canSave = form.name.trim() && form.prompt.trim() && cronPreview.split(/\s+/).length === 5;

    return (
        <div className="bg-gray-800 rounded-xl border border-indigo-600/50 p-4 space-y-3">
            <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Agent name (e.g. Morning news digest)"
                className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <textarea
                value={form.prompt}
                onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                rows={3}
                placeholder="What should the agent do each run? e.g. 'Search the web for the top AI news today and summarize the 5 most important stories.'"
                className="w-full px-3 py-2 text-sm bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            />

            {/* Schedule builder */}
            <div className="space-y-2">
                <label className="text-xs font-medium text-gray-400">Schedule</label>
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={form.draft.frequency}
                        onChange={(e) => setDraft({ frequency: e.target.value as Frequency })}
                        className="bg-gray-700 text-sm text-gray-200 rounded-lg px-2 py-1.5 border border-gray-600 focus:border-indigo-500 outline-none"
                    >
                        <option value="hourly">Hourly</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="custom">Custom (cron)</option>
                    </select>

                    {form.draft.frequency === "hourly" && (
                        <span className="flex items-center gap-1.5 text-sm text-gray-300">
                            at minute
                            <input
                                type="number" min={0} max={59} value={form.draft.minute}
                                onChange={(e) => setDraft({ minute: Math.min(59, Math.max(0, parseInt(e.target.value) || 0)) })}
                                className="w-16 bg-gray-700 text-sm text-gray-200 rounded-lg px-2 py-1.5 border border-gray-600 focus:border-indigo-500 outline-none"
                            />
                        </span>
                    )}

                    {form.draft.frequency === "weekly" && (
                        <select
                            value={form.draft.weekday}
                            onChange={(e) => setDraft({ weekday: parseInt(e.target.value) })}
                            className="bg-gray-700 text-sm text-gray-200 rounded-lg px-2 py-1.5 border border-gray-600 focus:border-indigo-500 outline-none"
                        >
                            {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                        </select>
                    )}

                    {form.draft.frequency === "monthly" && (
                        <span className="flex items-center gap-1.5 text-sm text-gray-300">
                            on day
                            <input
                                type="number" min={1} max={28} value={form.draft.dom}
                                onChange={(e) => setDraft({ dom: Math.min(28, Math.max(1, parseInt(e.target.value) || 1)) })}
                                className="w-16 bg-gray-700 text-sm text-gray-200 rounded-lg px-2 py-1.5 border border-gray-600 focus:border-indigo-500 outline-none"
                            />
                        </span>
                    )}

                    {(form.draft.frequency === "daily" || form.draft.frequency === "weekly" || form.draft.frequency === "monthly") && (
                        <span className="flex items-center gap-1.5 text-sm text-gray-300">
                            at
                            <input
                                type="time" value={form.draft.time}
                                onChange={(e) => setDraft({ time: e.target.value })}
                                className="bg-gray-700 text-sm text-gray-200 rounded-lg px-2 py-1.5 border border-gray-600 focus:border-indigo-500 outline-none"
                            />
                        </span>
                    )}

                    {form.draft.frequency === "custom" && (
                        <input
                            value={form.draft.custom}
                            onChange={(e) => setDraft({ custom: e.target.value })}
                            placeholder="min hour dom month dow"
                            className="flex-1 min-w-[180px] font-mono bg-gray-700 text-sm text-gray-200 rounded-lg px-2 py-1.5 border border-gray-600 focus:border-indigo-500 outline-none"
                        />
                    )}
                </div>
                <p className="text-[11px] text-gray-500">
                    <span className="font-mono text-gray-400">{cronPreview || "—"}</span>
                    {" · "}timezone {browserTz}
                </p>
            </div>

            {/* Tools */}
            <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-400">Tools</label>
                <div className="flex flex-wrap gap-1.5">
                    {TOOL_OPTIONS.map((tool) => (
                        <button
                            key={tool.id}
                            type="button"
                            onClick={() => toggleTool(tool.id)}
                            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                                form.tools.has(tool.id)
                                    ? "bg-indigo-600/30 border-indigo-500 text-indigo-200"
                                    : "bg-gray-700/50 border-gray-600 text-gray-400 hover:text-gray-200"
                            }`}
                        >
                            {tool.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Model override */}
            <input
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                placeholder="Model override (optional, e.g. anthropic:claude-sonnet-4-6) — blank = default"
                className="w-full px-3 py-2 text-xs font-mono bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />

            {/* Delivery */}
            <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={form.notify} onChange={(e) => setForm((f) => ({ ...f, notify: e.target.checked }))} className="accent-indigo-500" />
                    Notify me
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={form.saveToChat} onChange={(e) => setForm((f) => ({ ...f, saveToChat: e.target.checked }))} className="accent-indigo-500" />
                    Save output to a chat
                </label>
            </div>

            <div className="flex gap-2 justify-end pt-1">
                <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white rounded-lg transition-colors">Cancel</button>
                <button
                    onClick={() => onSave(form)}
                    disabled={!canSave || saving}
                    className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
                </button>
            </div>
        </div>
    );
}

export function ScheduledAgentsSection() {
    const [agents, setAgents] = useState<ScheduledAgent[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [running, setRunning] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/scheduled-agents");
            if (res.ok) setAgents(await res.json());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const formToBody = (f: FormState) => ({
        name: f.name.trim(),
        prompt: f.prompt.trim(),
        schedule: draftToCron(f.draft),
        timezone: browserTz,
        model: f.model.trim() || null,
        enabledTools: [...f.tools],
        notify: f.notify,
        saveToChat: f.saveToChat,
    });

    const create = async (f: FormState) => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/scheduled-agents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formToBody(f)),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || "Failed to create agent"); return; }
            setAgents((prev) => [data, ...prev]);
            setCreating(false);
        } finally {
            setSaving(false);
        }
    };

    const saveEdit = async (id: string, f: FormState) => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/scheduled-agents/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formToBody(f)),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || "Failed to update agent"); return; }
            setAgents((prev) => prev.map((a) => (a.id === id ? data : a)));
            setEditingId(null);
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (agent: ScheduledAgent) => {
        const next = !agent.active;
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, active: next } : a)));
        const res = await fetch(`/api/scheduled-agents/${agent.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: next }),
        });
        if (res.ok) { const data = await res.json(); setAgents((prev) => prev.map((a) => (a.id === agent.id ? data : a))); }
    };

    const remove = async (id: string) => {
        if (!confirm("Delete this scheduled agent? Its run history is also removed.")) return;
        setAgents((prev) => prev.filter((a) => a.id !== id));
        await fetch(`/api/scheduled-agents/${id}`, { method: "DELETE" });
    };

    const runNow = async (id: string) => {
        setRunning(id);
        setError(null);
        try {
            const res = await fetch(`/api/scheduled-agents/${id}/run`, { method: "POST" });
            const data = await res.json();
            if (!res.ok) setError(data.error || "Run failed");
            await load();
            setExpanded((prev) => new Set(prev).add(id));
        } finally {
            setRunning(null);
        }
    };

    const toggleExpand = (id: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <Clock size={17} className="text-indigo-400" /> Scheduled Agents
                    <span className="ml-1 text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full font-normal">{agents.length}</span>
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                    Run a prompt automatically on a recurring schedule — morning digests, recurring research, periodic summaries.
                </p>
            </div>

            {error && (
                <p className="text-sm px-3 py-2 rounded-lg border text-red-400 bg-red-900/20 border-red-800">{error}</p>
            )}

            <div className="space-y-2">
                {loading ? (
                    <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
                ) : agents.length === 0 && !creating ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                        <Clock size={32} className="text-gray-700" />
                        <p className="text-sm text-gray-500">No scheduled agents yet</p>
                    </div>
                ) : (
                    agents.map((agent) => (
                        <div key={agent.id} className="bg-gray-800/60 rounded-xl border border-gray-700/60 overflow-hidden">
                            {editingId === agent.id ? (
                                <div className="p-1">
                                    <AgentForm
                                        initial={{
                                            name: agent.name,
                                            prompt: agent.prompt,
                                            draft: cronToDraft(agent.schedule),
                                            model: agent.model ?? "",
                                            tools: new Set(agent.enabledTools),
                                            notify: agent.notify,
                                            saveToChat: agent.saveToChat,
                                        }}
                                        onCancel={() => setEditingId(null)}
                                        onSave={(f) => saveEdit(agent.id, f)}
                                        saving={saving}
                                    />
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-start gap-2 px-3 py-2.5">
                                        <button onClick={() => toggleExpand(agent.id)} className="mt-0.5 text-gray-400 hover:text-gray-200 shrink-0">
                                            {expanded.has(agent.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-white truncate">{agent.name}</span>
                                                {!agent.active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400">Paused</span>}
                                                {agent.lastStatus === "success" && <CheckCircle size={12} className="text-green-400 shrink-0" />}
                                                {agent.lastStatus === "error" && <AlertCircle size={12} className="text-red-400 shrink-0" />}
                                            </div>
                                            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                                {agent.scheduleLabel || agent.schedule}
                                                {agent.active && agent.nextRunAt && <> · next {relativeTime(agent.nextRunAt)}</>}
                                                {agent.runCount > 0 && <> · {agent.runCount} run{agent.runCount !== 1 ? "s" : ""}</>}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                            <button onClick={() => runNow(agent.id)} disabled={running === agent.id} title="Run now" className="p-1.5 rounded-lg text-gray-400 hover:text-green-400 hover:bg-gray-700 transition-colors disabled:opacity-50">
                                                {running === agent.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                                            </button>
                                            <button onClick={() => toggleActive(agent)} title={agent.active ? "Pause" : "Resume"} className={`p-1.5 rounded-lg hover:bg-gray-700 transition-colors ${agent.active ? "text-indigo-400 hover:text-indigo-300" : "text-gray-500 hover:text-gray-300"}`}>
                                                <Power size={13} />
                                            </button>
                                            <button onClick={() => { setEditingId(agent.id); setCreating(false); }} title="Edit" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors">
                                                <Pencil size={13} />
                                            </button>
                                            <button onClick={() => remove(agent.id)} title="Delete" className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-700 transition-colors">
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>

                                    {expanded.has(agent.id) && (
                                        <div className="border-t border-gray-700/60 px-4 py-3 space-y-2 text-xs">
                                            <p className="text-gray-400 whitespace-pre-wrap"><span className="text-gray-500">Prompt: </span>{agent.prompt}</p>
                                            {agent.enabledTools.length > 0 && (
                                                <p className="text-gray-500">Tools: {agent.enabledTools.join(", ")}</p>
                                            )}
                                            {agent.lastRunAt && (
                                                <p className="text-gray-500">Last run {relativeTime(agent.lastRunAt)}</p>
                                            )}
                                            {agent.lastStatus === "error" && agent.lastError && (
                                                <p className="text-red-400">Error: {agent.lastError}</p>
                                            )}
                                            {agent.lastResult && (
                                                <div className="bg-gray-900/60 rounded-lg p-2.5 border border-gray-700/50 max-h-48 overflow-y-auto">
                                                    <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{agent.lastResult}</p>
                                                </div>
                                            )}
                                            {agent.saveToChat && agent.chatId && (
                                                <p className="text-gray-500">Output is saved to the chat <span className="text-indigo-400">🕒 {agent.name}</span> in your sidebar.</p>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ))
                )}

                {creating && (
                    <AgentForm initial={emptyForm()} onCancel={() => setCreating(false)} onSave={create} saving={saving} />
                )}
            </div>

            {!creating && (
                <button
                    onClick={() => { setCreating(true); setEditingId(null); }}
                    className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded-xl transition-colors"
                >
                    <Plus size={14} /> New Scheduled Agent
                </button>
            )}
        </div>
    );
}
