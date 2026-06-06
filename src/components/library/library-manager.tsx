"use client";
import { useState } from "react";
import {
    Theater, Terminal, Database, Plus, Pencil, Trash2, Check, X, Cpu, Wrench,
    Share2, Link as LinkIcon, Globe, Users, EyeOff, Loader2,
} from "lucide-react";
import { useToast } from "@/components/providers/toast-provider";
import type { UserLibraryItemSummary, MarketplaceVisibility } from "@/types";

interface ModelOption { id: string; name: string }
interface KbOption { id: string; name: string; _count: { documents: number }; publishedToken?: string | null; publishedVisibility?: string | null }
interface ToolOption { id: string; label: string; description: string }
interface WorkspaceOption { id: string; name: string }
type Item = UserLibraryItemSummary & { publishedVisibility?: string | null };

interface Props {
    initialItems: Item[];
    knowledgeBases: KbOption[];
    models: ModelOption[];
    toolOptions: ToolOption[];
    toolsEnabled: boolean;
    workspaces: WorkspaceOption[];
}

// ── shared bits ───────────────────────────────────────────────────────────────

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
    return (
        <button type="button" onClick={onToggle} title={enabled ? "Disable" : "Enable"}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${enabled ? "bg-blue-600" : "bg-gray-600"}`}>
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0"}`} />
        </button>
    );
}

function CheckRow({ checked, onToggle, title, subtitle }: { checked: boolean; onToggle: () => void; title: string; subtitle?: string }) {
    return (
        <button type="button" onClick={onToggle} className="flex items-start gap-2.5 w-full px-3 py-2 text-left rounded-lg hover:bg-gray-800 transition-colors">
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

const VIS_META: Record<MarketplaceVisibility, { label: string; hint: string; icon: React.ReactNode }> = {
    public: { label: "Public", hint: "Anyone can find and import it", icon: <Globe size={15} /> },
    workspace: { label: "Workspace", hint: "Only members of a workspace", icon: <Users size={15} /> },
    unlisted: { label: "Unlisted", hint: "Only people with the link", icon: <EyeOff size={15} /> },
};

// ── publish modal ───────────────────────────────────────────────────────────

function PublishModal({
    type, sourceId, current, workspaces, onClose, onPublished,
}: {
    type: "persona" | "slash_command" | "knowledge_base";
    sourceId: string;
    current: { token: string | null; visibility: string | null };
    workspaces: WorkspaceOption[];
    onClose: () => void;
    onPublished: (token: string | null, visibility: MarketplaceVisibility | null) => void;
}) {
    const { toast } = useToast();
    const [visibility, setVisibility] = useState<MarketplaceVisibility>((current.visibility as MarketplaceVisibility) || "public");
    const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
    const [busy, setBusy] = useState(false);
    const [token, setToken] = useState<string | null>(current.token);

    const shareUrl = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/m/${token}` : "";

    const publish = async () => {
        if (visibility === "workspace" && !workspaceId) { toast("Select a workspace", "error"); return; }
        setBusy(true);
        try {
            const res = await fetch("/api/marketplace/publish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type, sourceId, visibility, workspaceId: visibility === "workspace" ? workspaceId : undefined }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Publish failed");
            setToken(data.shareToken);
            onPublished(data.shareToken, visibility);
            toast(data.updated ? "Listing updated" : "Published to marketplace", "success");
        } catch (e) {
            toast(e instanceof Error ? e.message : "Publish failed", "error");
        } finally {
            setBusy(false);
        }
    };

    const unpublish = async () => {
        if (!token) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/marketplace/${token}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Unpublish failed");
            setToken(null);
            onPublished(null, null);
            toast("Removed from marketplace", "success");
            onClose();
        } catch (e) {
            toast(e instanceof Error ? e.message : "Unpublish failed", "error");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold flex items-center gap-2"><Share2 size={17} className="text-blue-400" /> Share to marketplace</h3>
                    <button onClick={onClose} className="p-1 text-gray-500 hover:text-white"><X size={18} /></button>
                </div>

                <div className="space-y-2">
                    {(Object.keys(VIS_META) as MarketplaceVisibility[]).map((v) => (
                        <button key={v} onClick={() => setVisibility(v)}
                            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-left transition-colors ${visibility === v ? "border-blue-500 bg-blue-900/20" : "border-gray-700 hover:bg-gray-800"}`}>
                            <span className={visibility === v ? "text-blue-300" : "text-gray-400"}>{VIS_META[v].icon}</span>
                            <span className="min-w-0">
                                <span className="block text-sm text-gray-200">{VIS_META[v].label}</span>
                                <span className="block text-xs text-gray-500">{VIS_META[v].hint}</span>
                            </span>
                        </button>
                    ))}
                </div>

                {visibility === "workspace" && (
                    workspaces.length === 0 ? (
                        <p className="text-xs text-amber-500">You aren&apos;t a member of any workspace yet.</p>
                    ) : (
                        <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                    )
                )}

                {token && (
                    <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                        <LinkIcon size={14} className="text-gray-500 shrink-0" />
                        <input readOnly value={shareUrl} className="flex-1 bg-transparent text-xs text-gray-300 outline-none" />
                        <button onClick={() => { navigator.clipboard.writeText(shareUrl); toast("Link copied", "success"); }}
                            className="text-xs text-blue-400 hover:text-blue-300 shrink-0">Copy</button>
                    </div>
                )}

                <div className="flex justify-between gap-2 pt-1">
                    {token ? (
                        <button onClick={unpublish} disabled={busy} className="px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 border border-red-900/50 rounded-lg disabled:opacity-60">Unpublish</button>
                    ) : <span />}
                    <button onClick={publish} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg">
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                        {token ? "Update" : "Publish"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── persona / command forms ─────────────────────────────────────────────────

type PersonaDraft = { name: string; description: string; systemPrompt: string; model: string; knowledgeBaseIds: string[]; toolIds: string[] };
type CommandDraft = { command: string; description: string; prompt: string };

function PersonaForm({ draft, setDraft, models, knowledgeBases, toolOptions, toolsEnabled, onCancel, onSave, saving }: {
    draft: PersonaDraft; setDraft: (d: PersonaDraft) => void; models: ModelOption[]; knowledgeBases: KbOption[]; toolOptions: ToolOption[]; toolsEnabled: boolean; onCancel: () => void; onSave: () => void; saving: boolean;
}) {
    const toggleArr = (key: "knowledgeBaseIds" | "toolIds", id: string) => {
        const cur = draft[key];
        setDraft({ ...draft, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
    };
    return (
        <div className="p-4 space-y-4">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder='Name (e.g. "Research Buddy")' autoFocus
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Short description (optional)"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            <textarea value={draft.systemPrompt} onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })} rows={6} placeholder="System prompt — defines this assistant's behavior…"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" />

            <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><Cpu size={13} className="text-emerald-400" /> Model</label>
                {models.length === 0 ? (
                    <p className="text-xs text-gray-600">Model selection isn&apos;t available — uses the platform default.</p>
                ) : (
                    <select value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Platform default</option>
                        {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                )}
            </div>

            <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><Database size={13} className="text-sky-400" /> Knowledge bases</label>
                {knowledgeBases.length === 0 ? (
                    <p className="text-xs text-gray-600">No knowledge bases yet.</p>
                ) : (
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg divide-y divide-gray-800 max-h-40 overflow-y-auto">
                        {knowledgeBases.map((kb) => (
                            <CheckRow key={kb.id} checked={draft.knowledgeBaseIds.includes(kb.id)} onToggle={() => toggleArr("knowledgeBaseIds", kb.id)} title={kb.name} subtitle={`${kb._count.documents} document${kb._count.documents === 1 ? "" : "s"}`} />
                        ))}
                    </div>
                )}
            </div>

            <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><Wrench size={13} className="text-amber-400" /> Tools</label>
                {!toolsEnabled && <p className="text-xs text-amber-500/80">Tools are globally disabled.</p>}
                {toolOptions.length > 0 && (
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg divide-y divide-gray-800 max-h-40 overflow-y-auto">
                        {toolOptions.map((t) => <CheckRow key={t.id} checked={draft.toolIds.includes(t.id)} onToggle={() => toggleArr("toolIds", t.id)} title={t.label} subtitle={t.description} />)}
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:bg-gray-800"><X size={13} /> Cancel</button>
                <button onClick={onSave} disabled={saving || !draft.name.trim() || !draft.systemPrompt.trim()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg"><Check size={13} /> {saving ? "Saving…" : "Save"}</button>
            </div>
        </div>
    );
}

function CommandForm({ draft, setDraft, onCancel, onSave, saving }: { draft: CommandDraft; setDraft: (d: CommandDraft) => void; onCancel: () => void; onSave: () => void; saving: boolean }) {
    return (
        <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">/</span>
                <input value={draft.command} onChange={(e) => setDraft({ ...draft, command: e.target.value })} placeholder="command" autoFocus
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Description (optional)"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            <textarea value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} rows={4} placeholder="Prompt template inserted when the command is used…"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:bg-gray-800"><X size={13} /> Cancel</button>
                <button onClick={onSave} disabled={saving || !draft.command.trim() || !draft.prompt.trim()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg"><Check size={13} /> {saving ? "Saving…" : "Save"}</button>
            </div>
        </div>
    );
}

// ── main ───────────────────────────────────────────────────────────────────

export function LibraryManager({ initialItems, knowledgeBases: initialKbs, models, toolOptions, toolsEnabled, workspaces }: Props) {
    const { toast } = useToast();
    const [items, setItems] = useState<Item[]>(initialItems);
    const [kbs, setKbs] = useState<KbOption[]>(initialKbs);
    const [saving, setSaving] = useState(false);
    const [personaDraft, setPersonaDraft] = useState<{ id: string | null; draft: PersonaDraft } | null>(null);
    const [commandDraft, setCommandDraft] = useState<{ id: string | null; draft: CommandDraft } | null>(null);
    const [publishTarget, setPublishTarget] = useState<{ type: "persona" | "slash_command" | "knowledge_base"; sourceId: string; current: { token: string | null; visibility: string | null } } | null>(null);

    const personas = items.filter((i) => i.type === "persona");
    const commands = items.filter((i) => i.type === "slash_command");

    // ── persona CRUD ──
    const savePersona = async () => {
        if (!personaDraft) return;
        const { id, draft } = personaDraft;
        setSaving(true);
        try {
            const data = { name: draft.name.trim(), description: draft.description.trim(), systemPrompt: draft.systemPrompt.trim(), model: draft.model, knowledgeBaseIds: draft.knowledgeBaseIds, toolIds: draft.toolIds };
            const res = id
                ? await fetch(`/api/library/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) })
                : await fetch(`/api/library`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "persona", data }) });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
            const newId = id ?? (await res.json()).id;
            const next: Item = { id: newId, type: "persona", enabled: id ? (items.find((i) => i.id === id)?.enabled ?? true) : true, sourceItemId: id ? items.find((i) => i.id === id)?.sourceItemId : null, ...data, publishedToken: id ? items.find((i) => i.id === id)?.publishedToken : null, createdAt: new Date().toISOString() };
            setItems((prev) => id ? prev.map((i) => i.id === id ? next : i) : [next, ...prev]);
            setPersonaDraft(null);
        } catch (e) { toast(e instanceof Error ? e.message : "Save failed", "error"); }
        finally { setSaving(false); }
    };

    const saveCommand = async () => {
        if (!commandDraft) return;
        const { id, draft } = commandDraft;
        setSaving(true);
        try {
            const data = { command: draft.command.trim(), description: draft.description.trim(), prompt: draft.prompt.trim() };
            const res = id
                ? await fetch(`/api/library/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) })
                : await fetch(`/api/library`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "slash_command", data }) });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
            const newId = id ?? (await res.json()).id;
            const next: Item = { id: newId, type: "slash_command", enabled: id ? (items.find((i) => i.id === id)?.enabled ?? true) : true, sourceItemId: id ? items.find((i) => i.id === id)?.sourceItemId : null, name: data.command, ...data, publishedToken: id ? items.find((i) => i.id === id)?.publishedToken : null, createdAt: new Date().toISOString() };
            setItems((prev) => id ? prev.map((i) => i.id === id ? next : i) : [next, ...prev]);
            setCommandDraft(null);
        } catch (e) { toast(e instanceof Error ? e.message : "Save failed", "error"); }
        finally { setSaving(false); }
    };

    const toggleEnabled = async (item: Item) => {
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, enabled: !i.enabled } : i));
        await fetch(`/api/library/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !item.enabled }) }).catch(() => {});
    };

    const remove = async (item: Item) => {
        if (!window.confirm(`Delete this ${item.type === "persona" ? "assistant" : "command"}?`)) return;
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        await fetch(`/api/library/${item.id}`, { method: "DELETE" }).catch(() => {});
    };

    // Reflect publish/unpublish back into local state.
    const onPublished = (token: string | null, visibility: MarketplaceVisibility | null) => {
        if (!publishTarget) return;
        if (publishTarget.type === "knowledge_base") {
            setKbs((prev) => prev.map((k) => k.id === publishTarget.sourceId ? { ...k, publishedToken: token, publishedVisibility: visibility } : k));
        } else {
            setItems((prev) => prev.map((i) => i.id === publishTarget.sourceId ? { ...i, publishedToken: token, publishedVisibility: visibility } : i));
        }
        setPublishTarget((t) => t ? { ...t, current: { token, visibility } } : t);
    };

    const PublishChip = ({ visibility }: { visibility?: string | null }) => visibility ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-blue-900/30 text-blue-300 border border-blue-800 capitalize">
            <Share2 size={10} /> {visibility}
        </span>
    ) : null;

    return (
        <div className="space-y-10">
            {/* ── Assistants ── */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2"><Theater size={19} className="text-violet-400" /> My Assistants</h2>
                    <button onClick={() => setPersonaDraft({ id: null, draft: { name: "", description: "", systemPrompt: "", model: "", knowledgeBaseIds: [], toolIds: [] } })}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"><Plus size={15} /> New</button>
                </div>
                <p className="text-sm text-gray-400 -mt-1">Personal &ldquo;GPTs&rdquo; with their own system prompt, model, knowledge, and tools. Enabled ones appear in your chat toolbar.</p>

                {personaDraft?.id === null && (
                    <div className="bg-gray-900 border border-violet-700/50 rounded-xl">
                        <PersonaForm draft={personaDraft.draft} setDraft={(d) => setPersonaDraft({ id: null, draft: d })} models={models} knowledgeBases={kbs} toolOptions={toolOptions} toolsEnabled={toolsEnabled} onCancel={() => setPersonaDraft(null)} onSave={savePersona} saving={saving} />
                    </div>
                )}

                {personas.length === 0 && !personaDraft && <p className="text-sm text-gray-600 bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">No assistants yet.</p>}

                {personas.map((p) => personaDraft?.id === p.id ? (
                    <div key={p.id} className="bg-gray-900 border border-gray-700 rounded-xl">
                        <PersonaForm draft={personaDraft.draft} setDraft={(d) => setPersonaDraft({ id: p.id, draft: d })} models={models} knowledgeBases={kbs} toolOptions={toolOptions} toolsEnabled={toolsEnabled} onCancel={() => setPersonaDraft(null)} onSave={savePersona} saving={saving} />
                    </div>
                ) : (
                    <div key={p.id} className={`bg-gray-900 border rounded-xl p-4 ${p.enabled ? "border-gray-700" : "border-gray-800 opacity-60"}`}>
                        <div className="flex items-start gap-3">
                            <Toggle enabled={p.enabled} onToggle={() => toggleEnabled(p)} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={() => setPublishTarget({ type: "persona", sourceId: p.id, current: { token: p.publishedToken ?? null, visibility: p.publishedVisibility ?? null } })} title="Share" className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded-md"><Share2 size={13} /></button>
                                        <button onClick={() => setPersonaDraft({ id: p.id, draft: { name: p.name, description: p.description ?? "", systemPrompt: p.systemPrompt ?? "", model: p.model ?? "", knowledgeBaseIds: p.knowledgeBaseIds ?? [], toolIds: p.toolIds ?? [] } })} title="Edit" className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-md"><Pencil size={13} /></button>
                                        <button onClick={() => remove(p)} title="Delete" className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-md"><Trash2 size={13} /></button>
                                    </div>
                                </div>
                                {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                                <p className="text-sm text-gray-400 mt-1.5 line-clamp-2">{p.systemPrompt}</p>
                                <div className="flex flex-wrap gap-1.5 mt-2"><PublishChip visibility={p.publishedVisibility} /></div>
                            </div>
                        </div>
                    </div>
                ))}
            </section>

            {/* ── Commands ── */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2"><Terminal size={19} className="text-amber-400" /> My Commands</h2>
                    <button onClick={() => setCommandDraft({ id: null, draft: { command: "", description: "", prompt: "" } })}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"><Plus size={15} /> New</button>
                </div>
                <p className="text-sm text-gray-400 -mt-1">Reusable <code className="text-gray-300">/command</code> prompt shortcuts.</p>

                {commandDraft?.id === null && (
                    <div className="bg-gray-900 border border-amber-700/50 rounded-xl">
                        <CommandForm draft={commandDraft.draft} setDraft={(d) => setCommandDraft({ id: null, draft: d })} onCancel={() => setCommandDraft(null)} onSave={saveCommand} saving={saving} />
                    </div>
                )}

                {commands.length === 0 && !commandDraft && <p className="text-sm text-gray-600 bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">No commands yet.</p>}

                {commands.map((c) => commandDraft?.id === c.id ? (
                    <div key={c.id} className="bg-gray-900 border border-gray-700 rounded-xl">
                        <CommandForm draft={commandDraft.draft} setDraft={(d) => setCommandDraft({ id: c.id, draft: d })} onCancel={() => setCommandDraft(null)} onSave={saveCommand} saving={saving} />
                    </div>
                ) : (
                    <div key={c.id} className={`bg-gray-900 border rounded-xl p-4 ${c.enabled ? "border-gray-700" : "border-gray-800 opacity-60"}`}>
                        <div className="flex items-start gap-3">
                            <Toggle enabled={c.enabled} onToggle={() => toggleEnabled(c)} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-white truncate">/{c.command}</p>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={() => setPublishTarget({ type: "slash_command", sourceId: c.id, current: { token: c.publishedToken ?? null, visibility: c.publishedVisibility ?? null } })} title="Share" className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded-md"><Share2 size={13} /></button>
                                        <button onClick={() => setCommandDraft({ id: c.id, draft: { command: c.command ?? "", description: c.description ?? "", prompt: c.prompt ?? "" } })} title="Edit" className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-md"><Pencil size={13} /></button>
                                        <button onClick={() => remove(c)} title="Delete" className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-md"><Trash2 size={13} /></button>
                                    </div>
                                </div>
                                {c.description && <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>}
                                <p className="text-sm text-gray-400 mt-1.5 line-clamp-2">{c.prompt}</p>
                                <div className="flex flex-wrap gap-1.5 mt-2"><PublishChip visibility={c.publishedVisibility} /></div>
                            </div>
                        </div>
                    </div>
                ))}
            </section>

            {/* ── Knowledge ── */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold flex items-center gap-2"><Database size={19} className="text-sky-400" /> My Knowledge</h2>
                <p className="text-sm text-gray-400 -mt-1">Knowledge bases you own. Manage documents from the chat panel; share whole bases here.</p>
                {kbs.length === 0 ? (
                    <p className="text-sm text-gray-600 bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">No knowledge bases yet.</p>
                ) : kbs.map((kb) => (
                    <div key={kb.id} className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex items-center gap-3">
                        <Database size={18} className="text-sky-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{kb.name}</p>
                            <p className="text-xs text-gray-500">{kb._count.documents} document{kb._count.documents === 1 ? "" : "s"}</p>
                        </div>
                        <PublishChip visibility={kb.publishedVisibility} />
                        <button onClick={() => setPublishTarget({ type: "knowledge_base", sourceId: kb.id, current: { token: kb.publishedToken ?? null, visibility: kb.publishedVisibility ?? null } })}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-700 hover:bg-gray-800 text-gray-300 rounded-lg shrink-0"><Share2 size={13} /> Share</button>
                    </div>
                ))}
            </section>

            {publishTarget && (
                <PublishModal type={publishTarget.type} sourceId={publishTarget.sourceId} current={publishTarget.current} workspaces={workspaces} onClose={() => setPublishTarget(null)} onPublished={onPublished} />
            )}
        </div>
    );
}
