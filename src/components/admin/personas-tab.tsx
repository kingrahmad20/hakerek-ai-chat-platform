"use client";
import { useState } from "react";
import { Theater, Plus, Pencil, Trash2, Check, X, Cpu, Database, Wrench } from "lucide-react";
import { savePersonas } from "@/app/admin/actions";
import type { Persona } from "@/app/admin/actions";

interface ModelOption { id: string; name: string; provider?: string }
interface KbOption { id: string; name: string; _count: { documents: number } }
interface ToolOption { id: string; label: string; description: string }

interface PersonasTabProps {
    personas: Persona[];
    models: ModelOption[];
    knowledgeBases: KbOption[];
    toolOptions: ToolOption[];
    toolsEnabled: boolean;
}

type Draft = {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    model: string;
    knowledgeBaseIds: string[];
    toolIds: string[];
};

function emptyDraft(): Draft {
    return {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        systemPrompt: "",
        model: "",
        knowledgeBaseIds: [],
        toolIds: [],
    };
}

function toDraft(p: Persona): Draft {
    return {
        id: p.id,
        name: p.name,
        description: p.description ?? "",
        systemPrompt: p.systemPrompt,
        model: p.model ?? "",
        knowledgeBaseIds: p.knowledgeBaseIds ?? [],
        toolIds: p.toolIds ?? [],
    };
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            title={enabled ? "Disable" : "Enable"}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                enabled ? "bg-blue-600" : "bg-gray-600"
            }`}
        >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-4" : "translate-x-0"
            }`} />
        </button>
    );
}

function CheckRow({ checked, onToggle, title, subtitle }: { checked: boolean; onToggle: () => void; title: string; subtitle?: string }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className="flex items-start gap-2.5 w-full px-3 py-2 text-left rounded-lg hover:bg-gray-800 transition-colors"
        >
            <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 border ${checked ? "bg-blue-600 border-blue-600" : "border-gray-600"}`}>
                {checked && <Check size={10} className="text-white" />}
            </div>
            <div className="min-w-0">
                <div className="text-sm text-gray-200 truncate">{title}</div>
                {subtitle && <div className="text-xs text-gray-500 truncate">{subtitle}</div>}
            </div>
        </button>
    );
}

function AssistantForm({
    draft,
    setDraft,
    models,
    knowledgeBases,
    toolOptions,
    toolsEnabled,
    onCancel,
    onSave,
    saving,
    heading,
}: {
    draft: Draft;
    setDraft: (d: Draft) => void;
    models: ModelOption[];
    knowledgeBases: KbOption[];
    toolOptions: ToolOption[];
    toolsEnabled: boolean;
    onCancel: () => void;
    onSave: () => void;
    saving: boolean;
    heading: string;
}) {
    const toggleArr = (key: "knowledgeBaseIds" | "toolIds", id: string) => {
        const cur = draft[key];
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
        setDraft({ ...draft, [key]: next });
    };

    return (
        <div className="p-4 space-y-4">
            <p className="text-sm font-medium text-violet-400">{heading}</p>

            <div className="space-y-3">
                <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder='Name (e.g. "Support Agent")'
                    autoFocus
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <input
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    placeholder="Short description (optional)"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <textarea
                    value={draft.systemPrompt}
                    onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
                    rows={6}
                    placeholder="System prompt — defines this assistant's behavior, tone, and rules..."
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
            </div>

            {/* Model binding */}
            <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                    <Cpu size={13} className="text-emerald-400" /> Model
                </label>
                <select
                    value={draft.model}
                    onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                    <option value="">Platform default</option>
                    {draft.model && !models.some((m) => m.id === draft.model) && (
                        <option value={draft.model}>{draft.model} (current)</option>
                    )}
                    {models.map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.name}{m.provider ? ` · ${m.provider}` : ""}
                        </option>
                    ))}
                </select>
                <p className="text-xs text-gray-600">Overrides the default model whenever this assistant is selected.</p>
            </div>

            {/* Knowledge base binding */}
            <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                    <Database size={13} className="text-sky-400" /> Knowledge bases
                    {draft.knowledgeBaseIds.length > 0 && (
                        <span className="text-gray-600">· {draft.knowledgeBaseIds.length} bound</span>
                    )}
                </label>
                {knowledgeBases.length === 0 ? (
                    <p className="text-xs text-gray-600">No knowledge bases yet. Create one to bind it here.</p>
                ) : (
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg divide-y divide-gray-800 max-h-48 overflow-y-auto">
                        {knowledgeBases.map((kb) => (
                            <CheckRow
                                key={kb.id}
                                checked={draft.knowledgeBaseIds.includes(kb.id)}
                                onToggle={() => toggleArr("knowledgeBaseIds", kb.id)}
                                title={kb.name}
                                subtitle={`${kb._count.documents} document${kb._count.documents === 1 ? "" : "s"}`}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Tool binding */}
            <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                    <Wrench size={13} className="text-amber-400" /> Tools
                    {draft.toolIds.length > 0 && (
                        <span className="text-gray-600">· {draft.toolIds.length} enabled</span>
                    )}
                </label>
                {!toolsEnabled && (
                    <p className="text-xs text-amber-500/80">Tools are globally disabled — these take effect once tools are enabled in Settings.</p>
                )}
                {toolOptions.length === 0 ? (
                    <p className="text-xs text-gray-600">No tools available.</p>
                ) : (
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg divide-y divide-gray-800 max-h-48 overflow-y-auto">
                        {toolOptions.map((t) => (
                            <CheckRow
                                key={t.id}
                                checked={draft.toolIds.includes(t.id)}
                                onToggle={() => toggleArr("toolIds", t.id)}
                                title={t.label}
                                subtitle={t.description}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
                <button
                    onClick={onCancel}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
                >
                    <X size={13} /> Cancel
                </button>
                <button
                    onClick={onSave}
                    disabled={saving || !draft.name.trim() || !draft.systemPrompt.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition-colors"
                >
                    <Check size={13} /> {saving ? "Saving..." : "Save"}
                </button>
            </div>
        </div>
    );
}

export function PersonasTab({ personas: initialPersonas, models, knowledgeBases, toolOptions, toolsEnabled }: PersonasTabProps) {
    const [personas, setPersonas] = useState<Persona[]>(initialPersonas);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [adding, setAdding] = useState(false);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

    const kbName = (id: string) => knowledgeBases.find((k) => k.id === id)?.name ?? id;
    const toolLabel = (id: string) => toolOptions.find((t) => t.id === id)?.label ?? id;
    const modelName = (id: string) => models.find((m) => m.id === id)?.name ?? id;

    const persist = async (updated: Persona[]) => {
        setSaving(true);
        setFeedback(null);
        const fd = new FormData();
        fd.set("personas", JSON.stringify(updated));
        const result = await savePersonas(null, fd);
        setSaving(false);
        if (result) setFeedback({ ok: result.ok, text: result.message });
        return result;
    };

    const toggle = async (id: string) => {
        const updated = personas.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p));
        setPersonas(updated);
        await persist(updated);
    };

    const remove = async (id: string) => {
        if (!window.confirm("Delete this assistant?")) return;
        const updated = personas.filter((p) => p.id !== id);
        setPersonas(updated);
        await persist(updated);
    };

    const startAdd = () => {
        setEditingId(null);
        setAdding(true);
        setDraft(emptyDraft());
    };

    const startEdit = (p: Persona) => {
        setAdding(false);
        setEditingId(p.id);
        setDraft(toDraft(p));
    };

    const cancel = () => {
        setAdding(false);
        setEditingId(null);
        setDraft(null);
    };

    const save = async () => {
        if (!draft || !draft.name.trim() || !draft.systemPrompt.trim()) return;
        const record: Persona = {
            id: draft.id,
            name: draft.name.trim(),
            description: draft.description.trim(),
            systemPrompt: draft.systemPrompt.trim(),
            enabled: editingId ? (personas.find((p) => p.id === editingId)?.enabled ?? true) : true,
            model: draft.model,
            knowledgeBaseIds: draft.knowledgeBaseIds,
            toolIds: draft.toolIds,
        };
        const updated = editingId
            ? personas.map((p) => (p.id === editingId ? record : p))
            : [...personas, record];
        setPersonas(updated);
        cancel();
        await persist(updated);
    };

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Theater size={20} className="text-violet-400" />
                        Custom Assistants
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Build self-hosted &ldquo;GPTs.&rdquo; Each assistant has its own system prompt and can bind a model,
                        knowledge bases, and tools. Enabled assistants appear in the chat toolbar.
                    </p>
                </div>
                <button
                    onClick={startAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
                >
                    <Plus size={15} /> New Assistant
                </button>
            </div>

            {feedback && (
                <p className={`text-sm px-3 py-2 rounded-lg border ${feedback.ok
                    ? "text-green-400 bg-green-900/20 border-green-800"
                    : "text-red-400 bg-red-900/20 border-red-800"
                }`}>
                    {feedback.text}
                </p>
            )}

            {personas.length === 0 && !adding && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
                    <Theater size={36} className="text-gray-700 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 mb-1">No assistants yet.</p>
                    <p className="text-xs text-gray-600">Click &ldquo;New Assistant&rdquo; to create the first one.</p>
                </div>
            )}

            <div className="space-y-3">
                {personas.map((p) => (
                    <div
                        key={p.id}
                        className={`bg-gray-900 border rounded-xl overflow-hidden transition-opacity ${
                            p.enabled ? "border-gray-700" : "border-gray-800 opacity-60"
                        }`}
                    >
                        {editingId === p.id && draft ? (
                            <AssistantForm
                                draft={draft}
                                setDraft={setDraft}
                                models={models}
                                knowledgeBases={knowledgeBases}
                                toolOptions={toolOptions}
                                toolsEnabled={toolsEnabled}
                                onCancel={cancel}
                                onSave={save}
                                saving={saving}
                                heading="Edit Assistant"
                            />
                        ) : (
                            <div className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="pt-0.5">
                                        <Toggle enabled={p.enabled} onToggle={() => toggle(p.id)} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-semibold text-white leading-snug">{p.name}</p>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    onClick={() => startEdit(p)}
                                                    title="Edit"
                                                    className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
                                                >
                                                    <Pencil size={13} />
                                                </button>
                                                <button
                                                    onClick={() => remove(p.id)}
                                                    title="Delete"
                                                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-md transition-colors"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                        {p.description && (
                                            <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                                        )}
                                        <p className="text-sm text-gray-400 mt-1.5 leading-relaxed line-clamp-2">{p.systemPrompt}</p>

                                        {/* Binding chips */}
                                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                                            {p.model && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-emerald-900/30 text-emerald-300 border border-emerald-800">
                                                    <Cpu size={11} /> {modelName(p.model)}
                                                </span>
                                            )}
                                            {(p.knowledgeBaseIds ?? []).map((id) => (
                                                <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-sky-900/30 text-sky-300 border border-sky-800">
                                                    <Database size={11} /> {kbName(id)}
                                                </span>
                                            ))}
                                            {(p.toolIds ?? []).map((id) => (
                                                <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-amber-900/30 text-amber-300 border border-amber-800">
                                                    <Wrench size={11} /> {toolLabel(id)}
                                                </span>
                                            ))}
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                p.enabled
                                                    ? "bg-violet-900/30 text-violet-400 border border-violet-800"
                                                    : "bg-gray-800 text-gray-500 border border-gray-700"
                                            }`}>
                                                {p.enabled ? "Active" : "Inactive"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {adding && draft && (
                    <div className="bg-gray-900 border border-violet-700/50 rounded-xl">
                        <AssistantForm
                            draft={draft}
                            setDraft={setDraft}
                            models={models}
                            knowledgeBases={knowledgeBases}
                            toolOptions={toolOptions}
                            toolsEnabled={toolsEnabled}
                            onCancel={cancel}
                            onSave={save}
                            saving={saving}
                            heading="New Assistant"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
