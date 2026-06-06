"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    FlaskConical, Plus, Trash2, Pencil, Play, X, ChevronRight, Trophy,
    Clock, AlertTriangle, Loader2, CheckCircle2, ThumbsDown, Download, Database,
} from "lucide-react";
import { useToast } from "@/components/providers/toast-provider";
import { fmtUsd, shortModel } from "@/lib/pricing";

interface ModelItem {
    id: string;
    name: string;
    provider?: string;
}

interface Props {
    models: ModelItem[];
    defaultModel: string;
    hasApiKey: boolean;
}

interface SuiteSummary {
    id: string;
    name: string;
    description: string | null;
    systemPrompt: string | null;
    updatedAt: string;
    _count: { cases: number; runs: number };
}

interface CaseRow {
    id?: string;
    prompt: string;
    expected: string | null;
}

interface RunSummary {
    id: string;
    suiteId: string;
    status: string;
    models: string[];
    judgeModel: string | null;
    totalTasks: number;
    doneTasks: number;
    createdAt: string;
    completedAt: string | null;
    suite: { name: string };
}

interface ModelAgg {
    model: string;
    count: number;
    errors: number;
    avgScore: number | null;
    passRate: number | null;
    avgLatencyMs: number;
    inputTokens: number;
    outputTokens: number;
    estCostUsd: number;
}

interface ResultRow {
    id: string;
    caseId: string | null;
    prompt: string;
    model: string;
    output: string | null;
    score: number | null;
    passed: boolean | null;
    rationale: string | null;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    error: string | null;
}

interface RunDetail {
    run: {
        id: string;
        suiteName: string;
        status: string;
        models: string[];
        judgeModel: string | null;
        totalTasks: number;
        doneTasks: number;
        error: string | null;
        createdAt: string;
        completedAt: string | null;
    };
    byModel: ModelAgg[];
    results: ResultRow[];
}

const EMPTY_CASE: CaseRow = { prompt: "", expected: "" };

function modelName(models: ModelItem[], id: string) {
    return models.find((m) => m.id === id)?.name ?? shortModel(id);
}

function scoreColor(score: number | null) {
    if (score === null) return "text-gray-500";
    if (score >= 8) return "text-green-400";
    if (score >= 5) return "text-yellow-400";
    return "text-red-400";
}

export function EvalsTab({ models, defaultModel, hasApiKey }: Props) {
    const { toast } = useToast();

    const [suites, setSuites] = useState<SuiteSummary[]>([]);
    const [loadingSuites, setLoadingSuites] = useState(true);

    // Editor state (create / edit a suite)
    const [editorOpen, setEditorOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [systemPrompt, setSystemPrompt] = useState("");
    const [cases, setCases] = useState<CaseRow[]>([{ ...EMPTY_CASE }]);
    const [saving, setSaving] = useState(false);
    const [seeding, setSeeding] = useState(false);

    // Run launcher state
    const [launchSuite, setLaunchSuite] = useState<SuiteSummary | null>(null);
    const [pickedModels, setPickedModels] = useState<string[]>([]);
    const [judgeModel, setJudgeModel] = useState<string>(defaultModel || "");
    const [useJudge, setUseJudge] = useState(true);
    const [modelSearch, setModelSearch] = useState("");
    const [starting, setStarting] = useState(false);

    // Runs + detail
    const [runs, setRuns] = useState<RunSummary[]>([]);
    const [activeRunId, setActiveRunId] = useState<string | null>(null);
    const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
    const [expandedResult, setExpandedResult] = useState<string | null>(null);

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const loadSuites = useCallback(async () => {
        setLoadingSuites(true);
        try {
            const res = await fetch("/api/admin/evals/suites");
            const data = await res.json();
            setSuites(data.suites ?? []);
        } catch {
            /* ignore */
        } finally {
            setLoadingSuites(false);
        }
    }, []);

    const loadRuns = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/evals/runs");
            const data = await res.json();
            setRuns(data.runs ?? []);
        } catch {
            /* ignore */
        }
    }, []);

    useEffect(() => {
        loadSuites();
        loadRuns();
    }, [loadSuites, loadRuns]);

    const loadRunDetail = useCallback(async (runId: string) => {
        try {
            const res = await fetch(`/api/admin/evals/runs/${runId}`);
            if (!res.ok) return;
            const data: RunDetail = await res.json();
            setRunDetail(data);
            return data.run.status;
        } catch {
            /* ignore */
        }
    }, []);

    // Poll the active run while it is still running.
    useEffect(() => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        if (!activeRunId) return;

        loadRunDetail(activeRunId);
        pollRef.current = setInterval(async () => {
            const status = await loadRunDetail(activeRunId);
            if (status && status !== "running") {
                if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                loadRuns();
            }
        }, 2500);

        return () => {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        };
    }, [activeRunId, loadRunDetail, loadRuns]);

    // ── Editor ────────────────────────────────────────────────────────────────
    function openCreate() {
        setEditId(null);
        setName("");
        setDescription("");
        setSystemPrompt("");
        setCases([{ ...EMPTY_CASE }]);
        setEditorOpen(true);
    }

    async function seedFromDownvoted() {
        setSeeding(true);
        try {
            const res = await fetch("/api/admin/evals/seed-candidates");
            const data = await res.json();
            const candidates: { prompt: string }[] = data.candidates ?? [];
            if (candidates.length === 0) {
                toast("No downvoted responses to seed from yet", "success");
                return;
            }
            setEditId(null);
            setName(`Downvoted prompts — ${new Date().toLocaleDateString()}`);
            setDescription("Seeded from the user prompts behind the most downvoted responses.");
            setSystemPrompt("");
            setCases(candidates.map((c) => ({ prompt: c.prompt, expected: "" })));
            setEditorOpen(true);
            toast(`Loaded ${candidates.length} prompt${candidates.length !== 1 ? "s" : ""}`, "success");
        } catch {
            toast("Failed to load downvoted prompts", "error");
        } finally {
            setSeeding(false);
        }
    }

    async function openEdit(id: string) {
        try {
            const res = await fetch(`/api/admin/evals/suites/${id}`);
            const data = await res.json();
            const s = data.suite;
            setEditId(id);
            setName(s.name ?? "");
            setDescription(s.description ?? "");
            setSystemPrompt(s.systemPrompt ?? "");
            setCases(
                (s.cases ?? []).length
                    ? s.cases.map((c: CaseRow) => ({ prompt: c.prompt, expected: c.expected ?? "" }))
                    : [{ ...EMPTY_CASE }],
            );
            setEditorOpen(true);
        } catch {
            toast("Failed to load suite", "error");
        }
    }

    async function saveSuite() {
        const cleanCases = cases
            .map((c) => ({ prompt: c.prompt.trim(), expected: (c.expected ?? "").trim() || null }))
            .filter((c) => c.prompt);
        if (!name.trim()) { toast("Name is required", "error"); return; }
        if (cleanCases.length === 0) { toast("Add at least one test case", "error"); return; }

        setSaving(true);
        try {
            const url = editId ? `/api/admin/evals/suites/${editId}` : "/api/admin/evals/suites";
            const res = await fetch(url, {
                method: editId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, description, systemPrompt, cases: cleanCases }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast(err.error || "Failed to save suite", "error");
                return;
            }
            toast(editId ? "Suite updated" : "Suite created", "success");
            setEditorOpen(false);
            loadSuites();
        } finally {
            setSaving(false);
        }
    }

    async function deleteSuite(id: string, label: string) {
        if (!confirm(`Delete suite "${label}" and all of its runs?`)) return;
        const res = await fetch(`/api/admin/evals/suites/${id}`, { method: "DELETE" });
        if (res.ok) {
            toast("Suite deleted", "success");
            if (launchSuite?.id === id) setLaunchSuite(null);
            loadSuites();
            loadRuns();
        } else {
            toast("Failed to delete suite", "error");
        }
    }

    // ── Launcher ────────────────────────────────────────────────────────────────
    function openLauncher(s: SuiteSummary) {
        setLaunchSuite(s);
        setPickedModels([]);
        setModelSearch("");
        setUseJudge(true);
        setJudgeModel(defaultModel || "");
    }

    function toggleModel(id: string) {
        setPickedModels((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }

    async function startRun() {
        if (!launchSuite) return;
        if (pickedModels.length === 0) { toast("Pick at least one model", "error"); return; }
        if (useJudge && !judgeModel) { toast("Select a judge model", "error"); return; }

        setStarting(true);
        try {
            const res = await fetch("/api/admin/evals/runs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    suiteId: launchSuite.id,
                    models: pickedModels,
                    judgeModel: useJudge ? judgeModel : null,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast(data.error || "Failed to start run", "error");
                return;
            }
            toast("Eval run started", "success");
            setLaunchSuite(null);
            loadRuns();
            setActiveRunId(data.id);
        } finally {
            setStarting(false);
        }
    }

    const filteredModels = models.filter((m) => {
        if (!modelSearch) return true;
        const q = modelSearch.toLowerCase();
        return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
    });

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {!hasApiKey && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-600/30 rounded-xl text-yellow-400 text-sm">
                    No AI provider key configured. Add one in the{" "}
                    <a href="/admin?tab=apikeys" className="underline font-medium">API Keys</a> tab before running evals.
                </div>
            )}

            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="font-semibold flex items-center gap-2">
                        <FlaskConical size={18} className="text-blue-400" /> Prompt / Model Eval Harness
                    </h2>
                    <p className="text-xs text-gray-500 mt-1 max-w-2xl">
                        Build a suite of fixed test prompts, replay it across multiple models, and score each
                        response with an LLM judge — so you can tune the default and fallback models with data.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={seedFromDownvoted}
                        disabled={seeding}
                        title="Build a suite from the prompts behind your most downvoted responses"
                        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-60 text-gray-200 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                    >
                        <ThumbsDown size={15} /> {seeding ? "Loading…" : "Seed from downvoted"}
                    </button>
                    <button
                        onClick={openCreate}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                    >
                        <Plus size={16} /> New Suite
                    </button>
                </div>
            </div>

            <FeedbackExportPanel />

            {/* Suites grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {loadingSuites ? (
                    <p className="text-xs text-gray-600 animate-pulse">Loading suites…</p>
                ) : suites.length === 0 ? (
                    <p className="text-sm text-gray-600 italic">No eval suites yet. Create one to get started.</p>
                ) : (
                    suites.map((s) => (
                        <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col">
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="font-medium text-sm text-white truncate">{s.name}</h3>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => openEdit(s.id)} title="Edit"
                                        className="text-gray-500 hover:text-blue-400 transition-colors p-1">
                                        <Pencil size={14} />
                                    </button>
                                    <button onClick={() => deleteSuite(s.id, s.name)} title="Delete"
                                        className="text-gray-500 hover:text-red-400 transition-colors p-1">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            {s.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</p>}
                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-3">
                                <span>{s._count.cases} case{s._count.cases !== 1 ? "s" : ""}</span>
                                <span>·</span>
                                <span>{s._count.runs} run{s._count.runs !== 1 ? "s" : ""}</span>
                            </div>
                            <button
                                onClick={() => openLauncher(s)}
                                disabled={s._count.cases === 0}
                                className="mt-4 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-lg transition-colors"
                            >
                                <Play size={14} /> Run Eval
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Recent runs */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-gray-800">
                    <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider">Recent Runs</h2>
                </div>
                <div className="divide-y divide-gray-800">
                    {runs.length === 0 ? (
                        <p className="text-sm text-gray-600 italic p-5">No runs yet.</p>
                    ) : (
                        runs.map((r) => {
                            const pct = r.totalTasks ? Math.round((r.doneTasks / r.totalTasks) * 100) : 0;
                            return (
                                <button
                                    key={r.id}
                                    onClick={() => setActiveRunId(r.id)}
                                    className={`w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-gray-800/40 transition-colors ${activeRunId === r.id ? "bg-gray-800/60" : ""}`}
                                >
                                    <span className="shrink-0">
                                        {r.status === "running" ? <Loader2 size={16} className="text-blue-400 animate-spin" />
                                            : r.status === "error" ? <AlertTriangle size={16} className="text-red-400" />
                                            : <CheckCircle2 size={16} className="text-green-400" />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-gray-200 truncate">{r.suite.name}</p>
                                        <p className="text-xs text-gray-500">
                                            {r.models.length} model{r.models.length !== 1 ? "s" : ""}
                                            {r.judgeModel ? ` · judged by ${shortModel(r.judgeModel)}` : " · no judge"}
                                            {" · "}{new Date(r.createdAt).toLocaleString()}
                                        </p>
                                    </div>
                                    {r.status === "running" && (
                                        <span className="text-xs text-blue-400 shrink-0">{pct}% ({r.doneTasks}/{r.totalTasks})</span>
                                    )}
                                    <ChevronRight size={16} className="text-gray-600 shrink-0" />
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Run detail */}
            {runDetail && activeRunId && (
                <RunDetailPanel
                    detail={runDetail}
                    models={models}
                    expandedResult={expandedResult}
                    onToggleResult={(id) => setExpandedResult((cur) => (cur === id ? null : id))}
                    onClose={() => { setActiveRunId(null); setRunDetail(null); }}
                />
            )}

            {/* Editor modal */}
            {editorOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setEditorOpen(false)}>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-gray-800 sticky top-0 bg-gray-900">
                            <h3 className="font-semibold">{editId ? "Edit Suite" : "New Suite"}</h3>
                            <button onClick={() => setEditorOpen(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block mb-1.5 text-sm font-medium text-gray-300">Name</label>
                                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
                                    placeholder="e.g. Support tone & accuracy"
                                    className="w-full p-2.5 bg-gray-950 border border-gray-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" />
                            </div>
                            <div>
                                <label className="block mb-1.5 text-sm font-medium text-gray-300">Description <span className="text-gray-500 font-normal">(optional)</span></label>
                                <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500}
                                    className="w-full p-2.5 bg-gray-950 border border-gray-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm" />
                            </div>
                            <div>
                                <label className="block mb-1.5 text-sm font-medium text-gray-300">System Prompt <span className="text-gray-500 font-normal">(optional — applied to every case)</span></label>
                                <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} maxLength={4000} rows={2}
                                    className="w-full p-2.5 bg-gray-950 border border-gray-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-sm resize-y" />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-gray-300">Test Cases ({cases.length})</label>
                                    <button onClick={() => setCases((c) => [...c, { ...EMPTY_CASE }])}
                                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                                        <Plus size={14} /> Add case
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {cases.map((c, i) => (
                                        <div key={i} className="bg-gray-950 border border-gray-700 rounded-lg p-3 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-gray-500">Case {i + 1}</span>
                                                {cases.length > 1 && (
                                                    <button onClick={() => setCases((arr) => arr.filter((_, j) => j !== i))}
                                                        className="text-gray-600 hover:text-red-400"><X size={14} /></button>
                                                )}
                                            </div>
                                            <textarea
                                                value={c.prompt}
                                                onChange={(e) => setCases((arr) => arr.map((x, j) => j === i ? { ...x, prompt: e.target.value } : x))}
                                                placeholder="Prompt to send to the model…"
                                                rows={2}
                                                className="w-full p-2 bg-gray-900 border border-gray-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                                            />
                                            <input
                                                value={c.expected ?? ""}
                                                onChange={(e) => setCases((arr) => arr.map((x, j) => j === i ? { ...x, expected: e.target.value } : x))}
                                                placeholder="Expected answer / substring (optional — drives pass/fail)"
                                                className="w-full p-2 bg-gray-900 border border-gray-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 p-5 border-t border-gray-800 sticky bottom-0 bg-gray-900">
                            <button onClick={() => setEditorOpen(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                            <button onClick={saveSuite} disabled={saving}
                                className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg">
                                {saving ? "Saving…" : editId ? "Save Changes" : "Create Suite"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Run launcher modal */}
            {launchSuite && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setLaunchSuite(null)}>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-gray-800">
                            <h3 className="font-semibold">Run “{launchSuite.name}”</h3>
                            <button onClick={() => setLaunchSuite(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block mb-2 text-sm font-medium text-gray-300">
                                    Models to compare <span className="text-gray-500 font-normal">({pickedModels.length} selected, max 8)</span>
                                </label>
                                <input value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} placeholder="Search models…"
                                    className="w-full mb-2 p-2 bg-gray-950 border border-gray-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                                <div className="h-48 overflow-y-auto bg-gray-950 border border-gray-700 rounded-lg p-2 space-y-0.5">
                                    {filteredModels.length === 0 ? (
                                        <p className="text-sm text-gray-500 text-center py-6">{hasApiKey ? "No models match" : "API key required"}</p>
                                    ) : filteredModels.map((m) => (
                                        <label key={m.id} className="flex items-center gap-3 cursor-pointer px-2 py-1.5 hover:bg-gray-900 rounded-lg">
                                            <input type="checkbox" checked={pickedModels.includes(m.id)}
                                                onChange={() => toggleModel(m.id)} disabled={!pickedModels.includes(m.id) && pickedModels.length >= 8}
                                                className="w-4 h-4 rounded accent-green-500 shrink-0" />
                                            <span className="text-sm text-gray-300 flex-1 truncate">{m.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <input type="checkbox" checked={useJudge} onChange={(e) => setUseJudge(e.target.checked)}
                                    className="w-4 h-4 rounded accent-blue-500" />
                                <span className="text-sm text-gray-300">Score responses with an LLM judge</span>
                            </label>

                            {useJudge && (
                                <div>
                                    <label className="block mb-1.5 text-sm font-medium text-gray-300">Judge model</label>
                                    <select value={judgeModel} onChange={(e) => setJudgeModel(e.target.value)}
                                        className="w-full p-2.5 bg-gray-950 border border-gray-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500">
                                        <option value="">Select judge model…</option>
                                        {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <p className="text-xs text-gray-500">
                                {launchSuite._count.cases} case{launchSuite._count.cases !== 1 ? "s" : ""} ×{" "}
                                {pickedModels.length || "?"} model{pickedModels.length !== 1 ? "s" : ""}
                                {" = "}{launchSuite._count.cases * pickedModels.length} generation{launchSuite._count.cases * pickedModels.length !== 1 ? "s" : ""}
                                {useJudge ? " + judging" : ""}.
                            </p>
                        </div>
                        <div className="flex justify-end gap-2 p-5 border-t border-gray-800">
                            <button onClick={() => setLaunchSuite(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                            <button onClick={startRun} disabled={starting}
                                className="flex items-center gap-2 px-5 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium rounded-lg">
                                <Play size={14} /> {starting ? "Starting…" : "Start Run"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

type ExportFormat = "sft" | "dpo" | "eval" | "csv";
type ExportLabel = "good" | "bad" | "all";

const FORMAT_OPTIONS: { value: ExportFormat; label: string; hint: string }[] = [
    { value: "sft", label: "SFT (chat JSONL)", hint: "Supervised fine-tuning — one { messages } object per line." },
    { value: "dpo", label: "Preference pairs (DPO)", hint: "Prompts with both a good and bad answer, as preferred / rejected pairs." },
    { value: "eval", label: "Eval JSONL", hint: "Flat records with context, completion, label and vote metadata." },
    { value: "csv", label: "CSV", hint: "Spreadsheet-friendly rows of prompt, completion, label and votes." },
];

const RANGE_OPTIONS = [
    { value: 0, label: "All time" },
    { value: 7, label: "Last 7 days" },
    { value: 30, label: "Last 30 days" },
    { value: 90, label: "Last 90 days" },
];

function FeedbackExportPanel() {
    const { toast } = useToast();
    const [format, setFormat] = useState<ExportFormat>("sft");
    const [label, setLabel] = useState<ExportLabel>("good");
    const [range, setRange] = useState(0);
    const [stats, setStats] = useState<{ total: number; good: number; bad: number; pairs: number } | null>(null);
    const [loadingStats, setLoadingStats] = useState(false);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoadingStats(true);
        fetch(`/api/admin/evals/export?stats=1&range=${range}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (!cancelled && d) setStats(d); })
            .catch(() => { /* ignore */ })
            .finally(() => { if (!cancelled) setLoadingStats(false); });
        return () => { cancelled = true; };
    }, [range]);

    // How many records the current format + label will actually emit.
    const exportCount = stats
        ? format === "dpo"
            ? stats.pairs
            : label === "good" ? stats.good : label === "bad" ? stats.bad : stats.total
        : 0;

    async function download() {
        setDownloading(true);
        try {
            const url = `/api/admin/evals/export?format=${format}&label=${label}&range=${range}`;
            const res = await fetch(url);
            if (!res.ok) {
                toast("Export failed", "error");
                return;
            }
            const blob = await res.blob();
            const disposition = res.headers.get("Content-Disposition") || "";
            const match = disposition.match(/filename="([^"]+)"/);
            const filename = match?.[1] || `feedback-${format}.${format === "csv" ? "csv" : "jsonl"}`;
            const href = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = href;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(href);
            toast("Dataset downloaded", "success");
        } catch {
            toast("Export failed", "error");
        } finally {
            setDownloading(false);
        }
    }

    const activeFormat = FORMAT_OPTIONS.find((f) => f.value === format)!;

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-start gap-3">
                <Database size={18} className="text-purple-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                    <h2 className="font-semibold">Export feedback dataset</h2>
                    <p className="text-xs text-gray-500 mt-1 max-w-2xl">
                        Turn the 👍 / 👎 reactions your users leave on responses into a labeled dataset of good /
                        bad completions — ready for offline evals or fine-tuning (SFT, DPO).
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <div>
                    <label className="block mb-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Format</label>
                    <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}
                        className="w-full p-2.5 bg-gray-950 border border-gray-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-purple-500">
                        {FORMAT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block mb-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Include</label>
                    <select value={label} onChange={(e) => setLabel(e.target.value as ExportLabel)} disabled={format === "dpo"}
                        className="w-full p-2.5 bg-gray-950 border border-gray-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50">
                        <option value="good">👍 Good only</option>
                        <option value="bad">👎 Bad only</option>
                        <option value="all">Both labels</option>
                    </select>
                </div>
                <div>
                    <label className="block mb-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Range</label>
                    <select value={range} onChange={(e) => setRange(Number(e.target.value))}
                        className="w-full p-2.5 bg-gray-950 border border-gray-700 rounded-lg text-sm outline-none focus:ring-1 focus:ring-purple-500">
                        {RANGE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                </div>
            </div>

            <p className="text-xs text-gray-500 mt-3">{activeFormat.hint}</p>

            <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-gray-800">
                <div className="text-xs text-gray-400">
                    {loadingStats || !stats ? (
                        <span className="text-gray-600 animate-pulse">Counting feedback…</span>
                    ) : (
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-green-400">{stats.good} good</span>
                            <span className="text-red-400">{stats.bad} bad</span>
                            <span className="text-purple-400">{stats.pairs} pair{stats.pairs !== 1 ? "s" : ""}</span>
                            <span className="text-gray-600">·</span>
                            <span className="text-gray-300">{exportCount} record{exportCount !== 1 ? "s" : ""} in this export</span>
                        </span>
                    )}
                </div>
                <button onClick={download} disabled={downloading || exportCount === 0}
                    title={exportCount === 0 ? "No matching feedback to export" : undefined}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
                    {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    {downloading ? "Exporting…" : "Download dataset"}
                </button>
            </div>
        </div>
    );
}

function RunDetailPanel({
    detail, models, expandedResult, onToggleResult, onClose,
}: {
    detail: RunDetail;
    models: ModelItem[];
    expandedResult: string | null;
    onToggleResult: (id: string) => void;
    onClose: () => void;
}) {
    const { run, byModel, results } = detail;
    const pct = run.totalTasks ? Math.round((run.doneTasks / run.totalTasks) * 100) : 0;

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
                <div>
                    <h2 className="font-semibold flex items-center gap-2">
                        {run.status === "running" ? <Loader2 size={16} className="text-blue-400 animate-spin" />
                            : run.status === "error" ? <AlertTriangle size={16} className="text-red-400" />
                            : <Trophy size={16} className="text-yellow-400" />}
                        {run.suiteName}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {run.status === "running" ? `Running — ${pct}% (${run.doneTasks}/${run.totalTasks})`
                            : run.status === "error" ? `Failed: ${run.error ?? "unknown error"}`
                            : `Completed ${run.completedAt ? new Date(run.completedAt).toLocaleString() : ""}`}
                    </p>
                </div>
                <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>

            {/* Leaderboard */}
            <div className="p-5 overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                    <thead>
                        <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                            <th className="pb-2 font-medium">#</th>
                            <th className="pb-2 font-medium">Model</th>
                            {run.judgeModel && <th className="pb-2 font-medium text-right">Avg Score</th>}
                            <th className="pb-2 font-medium text-right">Pass Rate</th>
                            <th className="pb-2 font-medium text-right">Avg Latency</th>
                            <th className="pb-2 font-medium text-right">Tokens</th>
                            <th className="pb-2 font-medium text-right">Est. Cost</th>
                            <th className="pb-2 font-medium text-right">Errors</th>
                        </tr>
                    </thead>
                    <tbody>
                        {byModel.map((m, i) => (
                            <tr key={m.model} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td className="py-2.5 text-gray-500">{i === 0 && run.judgeModel ? "🏆" : i + 1}</td>
                                <td className="py-2.5 text-gray-300 font-mono text-xs truncate max-w-[200px]" title={m.model}>
                                    {modelName(models, m.model)}
                                </td>
                                {run.judgeModel && (
                                    <td className={`py-2.5 text-right font-semibold ${scoreColor(m.avgScore)}`}>
                                        {m.avgScore === null ? "—" : m.avgScore.toFixed(2)}
                                    </td>
                                )}
                                <td className="py-2.5 text-right text-gray-400">{m.passRate === null ? "—" : `${m.passRate}%`}</td>
                                <td className="py-2.5 text-right text-gray-400">{(m.avgLatencyMs / 1000).toFixed(2)}s</td>
                                <td className="py-2.5 text-right text-gray-400">{(m.inputTokens + m.outputTokens).toLocaleString()}</td>
                                <td className="py-2.5 text-right text-yellow-400">{fmtUsd(m.estCostUsd)}</td>
                                <td className={`py-2.5 text-right ${m.errors > 0 ? "text-red-400" : "text-gray-600"}`}>{m.errors}</td>
                            </tr>
                        ))}
                        {byModel.length === 0 && (
                            <tr><td colSpan={8} className="py-6 text-center text-gray-600 text-xs">Waiting for first results…</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Per-result detail */}
            {results.length > 0 && (
                <div className="border-t border-gray-800 p-5 space-y-2">
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Responses ({results.length})</h3>
                    {results.map((r) => {
                        const open = expandedResult === r.id;
                        return (
                            <div key={r.id} className="bg-gray-950 border border-gray-800 rounded-lg">
                                <button onClick={() => onToggleResult(r.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left">
                                    <span className="text-xs text-gray-500 font-mono shrink-0 w-28 truncate" title={r.model}>{shortModel(r.model)}</span>
                                    <span className="text-xs text-gray-400 flex-1 truncate">{r.prompt}</span>
                                    {r.error ? (
                                        <span className="text-xs text-red-400 shrink-0 flex items-center gap-1"><AlertTriangle size={11} /> error</span>
                                    ) : (
                                        <>
                                            {r.score !== null && <span className={`text-xs font-semibold shrink-0 ${scoreColor(r.score)}`}>{r.score.toFixed(1)}</span>}
                                            {r.passed !== null && (
                                                <span className={`text-xs shrink-0 ${r.passed ? "text-green-400" : "text-red-400"}`}>{r.passed ? "pass" : "fail"}</span>
                                            )}
                                            <span className="text-xs text-gray-600 shrink-0 flex items-center gap-1"><Clock size={11} />{(r.latencyMs / 1000).toFixed(1)}s</span>
                                        </>
                                    )}
                                    <ChevronRight size={14} className={`text-gray-600 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
                                </button>
                                {open && (
                                    <div className="px-4 pb-3 space-y-2 text-xs">
                                        <div>
                                            <p className="text-gray-500 mb-1">Prompt</p>
                                            <p className="text-gray-300 whitespace-pre-wrap bg-gray-900 rounded p-2">{r.prompt}</p>
                                        </div>
                                        {r.rationale && (
                                            <div>
                                                <p className="text-gray-500 mb-1">Judge</p>
                                                <p className="text-gray-400 bg-gray-900 rounded p-2">{r.rationale}</p>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-gray-500 mb-1">Response</p>
                                            <p className="text-gray-300 whitespace-pre-wrap bg-gray-900 rounded p-2 max-h-72 overflow-y-auto">
                                                {r.error ? <span className="text-red-400">{r.error}</span> : (r.output || "(empty)")}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
