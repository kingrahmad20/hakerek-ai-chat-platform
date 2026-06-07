"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
    X, User, Lock, Trash2, MessageSquare, Globe, Camera,
    Brain, BookOpen, BarChart2, ShieldAlert, Palette, Clock,
    Plus, Pencil, Check, Loader2, Upload, ChevronDown, ChevronRight,
    FileText, AlertCircle, CheckCircle, DollarSign,
    CreditCard, ExternalLink, Zap, Crown, Star,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useI18n } from "@/components/providers/i18n-provider";
import { type Locale } from "@/i18n/translations";
import { BarChart, LineChart } from "@/components/ui/charts";
import { fmtUsd, shortModel } from "@/lib/pricing";
import { ScheduledAgentsSection } from "@/components/settings/scheduled-agents-section";
import type { KnowledgeBaseSummary, KnowledgeDocumentSummary } from "@/types";

export type SettingsTab =
    | "profile"
    | "account"
    | "billing"
    | "system-prompt"
    | "appearance"
    | "memory"
    | "knowledge"
    | "scheduled"
    | "usage"
    | "danger";

interface SettingsModalProps {
    onClose: () => void;
    initialTab?: SettingsTab;
}

type Feedback = { type: "ok" | "err"; text: string } | null;

function Alert({ fb }: { fb: Feedback }) {
    if (!fb) return null;
    return (
        <p className={`text-sm px-3 py-2 rounded-lg border ${fb.type === "ok" ? "text-green-400 bg-green-900/20 border-green-800" : "text-red-400 bg-red-900/20 border-red-800"}`}>
            {fb.text}
        </p>
    );
}

function resizeToSquare(file: File, size: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d")!;
                const min = Math.min(img.width, img.height);
                const sx = (img.width - min) / 2;
                const sy = (img.height - min) / 2;
                ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
                resolve(canvas.toDataURL("image/jpeg", 0.88));
            };
            img.onerror = reject;
            img.src = ev.target!.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function fmtTokens(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(0) + "K";
    return String(n);
}

// ── Memory section ────────────────────────────────────────────────────────────

interface Memory {
    id: string;
    content: string;
    category: string;
    sourceId?: string | null;
    createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
    personal: "Personal",
    preference: "Preference",
    goal: "Goal",
    context: "Context",
    general: "General",
};

const CATEGORY_COLORS: Record<string, string> = {
    personal: "bg-blue-500/15 text-blue-300",
    preference: "bg-purple-500/15 text-purple-300",
    goal: "bg-green-500/15 text-green-300",
    context: "bg-orange-500/15 text-orange-300",
    general: "bg-gray-500/15 text-gray-400",
};

function MemorySection() {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [addingNew, setAddingNew] = useState(false);
    const [newContent, setNewContent] = useState("");
    const [newCategory, setNewCategory] = useState("general");
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/memories");
            if (res.ok) setMemories(await res.json());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    async function deleteMemory(id: string) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
        await fetch(`/api/memories/${id}`, { method: "DELETE" });
    }

    function startEdit(m: Memory) {
        setEditingId(m.id);
        setEditValue(m.content);
    }

    async function saveEdit(id: string) {
        if (!editValue.trim()) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/memories/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: editValue.trim() }),
            });
            if (res.ok) {
                const updated = await res.json();
                setMemories((prev) => prev.map((m) => (m.id === id ? updated : m)));
            }
        } finally {
            setSaving(false);
            setEditingId(null);
        }
    }

    async function addMemory() {
        if (!newContent.trim()) return;
        setSaving(true);
        try {
            const res = await fetch("/api/memories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: newContent.trim(), category: newCategory }),
            });
            if (res.ok) {
                const created = await res.json();
                setMemories((prev) => [created, ...prev]);
                setNewContent("");
                setNewCategory("general");
                setAddingNew(false);
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <Brain size={17} className="text-violet-400" /> Long-term Memory
                    <span className="ml-1 text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full font-normal">{memories.length}</span>
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                    The AI automatically extracts and remembers important facts from your conversations.
                </p>
            </div>

            <div className="space-y-2">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 size={20} className="animate-spin text-gray-500" />
                    </div>
                ) : memories.length === 0 && !addingNew ? (
                    <p className="text-center text-xs text-gray-600 py-10">
                        No memories yet. They will be extracted automatically after conversations.
                    </p>
                ) : (
                    memories.map((m) => (
                        <div
                            key={m.id}
                            className="group flex items-start gap-3 bg-gray-800/50 rounded-xl px-3 py-2.5 border border-gray-700/50"
                        >
                            <span className={`mt-0.5 shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[m.category] ?? CATEGORY_COLORS.general}`}>
                                {CATEGORY_LABELS[m.category] ?? "General"}
                            </span>

                            {editingId === m.id ? (
                                <div className="flex-1 flex items-center gap-2">
                                    <input
                                        className="flex-1 bg-gray-700 text-sm text-white rounded-lg px-2 py-1 outline-none border border-gray-600 focus:border-violet-500"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") saveEdit(m.id);
                                            if (e.key === "Escape") setEditingId(null);
                                        }}
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => saveEdit(m.id)}
                                        disabled={saving}
                                        className="p-1 rounded text-green-400 hover:text-green-300"
                                    >
                                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                    </button>
                                    <button onClick={() => setEditingId(null)} className="p-1 rounded text-gray-500 hover:text-gray-300">
                                        <X size={13} />
                                    </button>
                                </div>
                            ) : (
                                <p className="flex-1 text-sm text-gray-300 leading-snug">{m.content}</p>
                            )}

                            {editingId !== m.id && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button onClick={() => startEdit(m)} className="p-1 rounded text-gray-500 hover:text-gray-300 transition-colors">
                                        <Pencil size={12} />
                                    </button>
                                    <button onClick={() => deleteMemory(m.id)} className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}

                {addingNew && (
                    <div className="bg-gray-800/70 rounded-xl px-3 py-3 border border-violet-500/40 space-y-2">
                        <textarea
                            className="w-full bg-gray-700 text-sm text-white rounded-lg px-3 py-2 outline-none border border-gray-600 focus:border-violet-500 resize-none"
                            placeholder="Enter a memory..."
                            rows={2}
                            value={newContent}
                            onChange={(e) => setNewContent(e.target.value)}
                            autoFocus
                        />
                        <div className="flex items-center gap-2">
                            <select
                                value={newCategory}
                                onChange={(e) => setNewCategory(e.target.value)}
                                className="flex-1 bg-gray-700 text-xs text-gray-300 rounded-lg px-2 py-1.5 border border-gray-600 focus:border-violet-500 outline-none"
                            >
                                {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                                    <option key={val} value={val}>{label}</option>
                                ))}
                            </select>
                            <button
                                onClick={addMemory}
                                disabled={saving || !newContent.trim()}
                                className="px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg transition-colors"
                            >
                                {saving ? <Loader2 size={12} className="animate-spin" /> : "Save"}
                            </button>
                            <button
                                onClick={() => { setAddingNew(false); setNewContent(""); }}
                                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <button
                onClick={() => setAddingNew(true)}
                disabled={addingNew}
                className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 disabled:opacity-40 transition-colors"
            >
                <Plus size={13} /> Add memory
            </button>
        </div>
    );
}

// ── Knowledge section ─────────────────────────────────────────────────────────

const FILE_ACCEPT = ".pdf,.docx,.doc,.txt,.md,.csv";
const POLL_INTERVAL = 3000;

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusIcon({ status }: { status: string }) {
    if (status === "processing") return <Loader2 size={13} className="animate-spin text-yellow-400 shrink-0" />;
    if (status === "ready") return <CheckCircle size={13} className="text-green-400 shrink-0" />;
    return <AlertCircle size={13} className="text-red-400 shrink-0" />;
}

function KnowledgeSection() {
    const [bases, setBases] = useState<KnowledgeBaseSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [uploading, setUploading] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = async () => {
        try {
            const res = await fetch("/api/knowledge");
            if (!res.ok) return;
            setBases(await res.json());
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    useEffect(() => {
        const hasProcessing = bases.some((kb) => kb.documents.some((d) => d.status === "processing"));
        if (hasProcessing && !pollRef.current) {
            pollRef.current = setInterval(load, POLL_INTERVAL);
        } else if (!hasProcessing && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [bases]);

    const toggleExpand = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            return next;
        });
    };

    const createKb = async () => {
        const name = newName.trim();
        if (!name) return;
        setCreating(false);
        setNewName("");
        setNewDesc("");
        const res = await fetch("/api/knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description: newDesc.trim() || undefined }),
        });
        if (!res.ok) return;
        const kb = await res.json();
        setBases((prev) => [{ ...kb, documents: [] }, ...prev]);
        setExpanded((prev) => new Set([...prev, kb.id]));
    };

    const deleteKb = async (id: string) => {
        if (!confirm("Delete this knowledge base and all its documents?")) return;
        await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
        setBases((prev) => prev.filter((kb) => kb.id !== id));
    };

    const deleteDoc = async (kbId: string, docId: string) => {
        await fetch(`/api/knowledge/${kbId}/documents/${docId}`, { method: "DELETE" });
        setBases((prev) =>
            prev.map((kb) =>
                kb.id === kbId ? { ...kb, documents: kb.documents.filter((d) => d.id !== docId) } : kb
            )
        );
    };

    const triggerUpload = (kbId: string) => {
        uploadTargetRef.current = kbId;
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (!file || !uploadTargetRef.current) return;
        const kbId = uploadTargetRef.current;
        setUploading(kbId);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(`/api/knowledge/${kbId}/documents`, { method: "POST", body: form });
            if (!res.ok) { alert(`Upload failed: ${await res.text()}`); return; }
            const doc: KnowledgeDocumentSummary = await res.json();
            setBases((prev) =>
                prev.map((kb) =>
                    kb.id === kbId ? { ...kb, documents: [{ ...doc, _count: { chunks: 0 } }, ...kb.documents] } : kb
                )
            );
        } finally {
            setUploading(null);
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <BookOpen size={17} className="text-blue-400" /> Knowledge Base
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                    Upload documents that the AI can reference during conversations.
                </p>
            </div>

            <div className="space-y-3">
                {loading ? (
                    <div className="flex items-center justify-center py-12 text-gray-500">
                        <Loader2 size={20} className="animate-spin" />
                    </div>
                ) : bases.length === 0 && !creating ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                        <BookOpen size={32} className="text-gray-700" />
                        <p className="text-sm text-gray-500">No knowledge bases yet</p>
                        <p className="text-xs text-gray-600">Create one to upload documents</p>
                    </div>
                ) : (
                    bases.map((kb) => (
                        <div key={kb.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2.5">
                                <button onClick={() => toggleExpand(kb.id)} className="flex-1 flex items-center gap-2 text-left min-w-0">
                                    {expanded.has(kb.id)
                                        ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
                                        : <ChevronRight size={14} className="text-gray-400 shrink-0" />
                                    }
                                    <span className="text-sm font-medium text-white truncate">{kb.name}</span>
                                    <span className="text-xs text-gray-500 shrink-0">
                                        {kb.documents.length} doc{kb.documents.length !== 1 ? "s" : ""}
                                    </span>
                                </button>
                                <button
                                    onClick={() => triggerUpload(kb.id)}
                                    disabled={uploading === kb.id}
                                    title="Upload document"
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-gray-700 transition-colors disabled:opacity-50"
                                >
                                    {uploading === kb.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                </button>
                                <button
                                    onClick={() => deleteKb(kb.id)}
                                    title="Delete knowledge base"
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-700 transition-colors"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>

                            {expanded.has(kb.id) && (
                                <div className="border-t border-gray-700 divide-y divide-gray-700/60">
                                    {kb.documents.length === 0 ? (
                                        <p className="text-xs text-gray-500 px-4 py-3">No documents yet — click Upload to add one</p>
                                    ) : (
                                        kb.documents.map((doc) => (
                                            <div key={doc.id} className="flex items-center gap-2 px-4 py-2.5">
                                                <StatusIcon status={doc.status} />
                                                <FileText size={13} className="text-gray-500 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-gray-300 truncate">{doc.fileName}</p>
                                                    <p className="text-[10px] text-gray-600">
                                                        {formatBytes(doc.fileSize)}
                                                        {doc.status === "ready" && ` · ${doc._count.chunks} chunks`}
                                                        {doc.status === "error" && (
                                                            <span className="text-red-500 ml-1">{doc.errorMessage}</span>
                                                        )}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => deleteDoc(kb.id, doc.id)}
                                                    title="Delete document"
                                                    className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors shrink-0"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}

                {creating && (
                    <div className="bg-gray-800 rounded-xl border border-blue-600 p-3 space-y-2">
                        <input
                            autoFocus
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") createKb();
                                if (e.key === "Escape") { setCreating(false); setNewName(""); setNewDesc(""); }
                            }}
                            placeholder="Knowledge base name"
                            className="w-full px-3 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <input
                            value={newDesc}
                            onChange={(e) => setNewDesc(e.target.value)}
                            placeholder="Description (optional)"
                            className="w-full px-3 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white rounded-lg transition-colors">Cancel</button>
                            <button onClick={createKb} disabled={!newName.trim()} className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">Create</button>
                        </div>
                    </div>
                )}
            </div>

            <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded-xl transition-colors"
            >
                <Plus size={14} /> New Knowledge Base
            </button>

            <input ref={fileInputRef} type="file" accept={FILE_ACCEPT} className="hidden" onChange={handleFileChange} />
        </div>
    );
}

// ── Main settings modal ───────────────────────────────────────────────────────

interface NavItem {
    tab: SettingsTab;
    label: string;
    icon: React.ReactNode;
    group?: string;
}

const NAV_ITEMS: NavItem[] = [
    { tab: "profile",       label: "Profile",       icon: <User size={15} />,          group: "Account" },
    { tab: "account",       label: "Security",      icon: <Lock size={15} />,          group: "Account" },
    { tab: "billing",       label: "Billing",       icon: <CreditCard size={15} className="text-emerald-400" />, group: "Account" },
    { tab: "system-prompt", label: "System Prompt", icon: <MessageSquare size={15} />, group: "Personalization" },
    { tab: "appearance",    label: "Appearance",    icon: <Palette size={15} />,       group: "Personalization" },
    { tab: "memory",        label: "Memory",        icon: <Brain size={15} className="text-violet-400" />, group: "AI & Data" },
    { tab: "knowledge",     label: "Knowledge",     icon: <BookOpen size={15} className="text-blue-400" />, group: "AI & Data" },
    { tab: "scheduled",     label: "Scheduled",     icon: <Clock size={15} className="text-indigo-400" />, group: "AI & Data" },
    { tab: "usage",         label: "Usage",         icon: <BarChart2 size={15} />,     group: "AI & Data" },
    { tab: "danger",        label: "Danger Zone",   icon: <Trash2 size={15} className="text-red-400" />, group: "Danger Zone" },
];

export function SettingsModal({ onClose, initialTab = "profile" }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
    const { t, locale, setLocale, LOCALES, LOCALE_NAMES } = useI18n();

    // User data
    const [userData, setUserData] = useState<{
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
        systemPrompt: string | null;
        locale: Locale;
    } | null>(null);
    const [userLoading, setUserLoading] = useState(true);

    useEffect(() => {
        fetch("/api/user/profile")
            .then((r) => r.json())
            .then((data) => { setUserData(data); setUserLoading(false); })
            .catch(() => setUserLoading(false));
    }, []);

    // Close on backdrop click or Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    // Group nav items
    const groups = NAV_ITEMS.reduce<Record<string, NavItem[]>>((acc, item) => {
        const g = item.group ?? "";
        (acc[g] ??= []).push(item);
        return acc;
    }, {});

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="relative w-full max-w-3xl bg-gray-900 border border-gray-700/80 rounded-2xl shadow-2xl flex overflow-hidden"
                style={{ height: "min(85vh, 680px)" }}>

                {/* Left nav */}
                <div className="w-52 shrink-0 bg-gray-950/70 border-r border-gray-800 flex flex-col overflow-y-auto">
                    <div className="px-4 pt-5 pb-3 shrink-0">
                        <h2 className="text-sm font-semibold text-white tracking-wide">Settings</h2>
                    </div>

                    <nav className="flex-1 px-2 pb-4 space-y-0.5">
                        {Object.entries(groups).map(([groupName, items]) => (
                            <div key={groupName} className="mb-1">
                                {groupName !== "Account" && (
                                    <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                                        {groupName}
                                    </p>
                                )}
                                {items.map((item) => (
                                    <button
                                        key={item.tab}
                                        onClick={() => setActiveTab(item.tab)}
                                        className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                                            activeTab === item.tab
                                                ? "bg-gray-800 text-white"
                                                : "text-gray-400 hover:text-white hover:bg-gray-800/60"
                                        }`}
                                    >
                                        {item.icon}
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </nav>
                </div>

                {/* Right content */}
                <div className="flex-1 overflow-y-auto bg-gray-950/30">
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors z-10"
                    >
                        <X size={16} />
                    </button>

                    <div className="p-6 pr-12">
                        {userLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 size={24} className="animate-spin text-gray-500" />
                            </div>
                        ) : (
                            <TabContent
                                tab={activeTab}
                                userData={userData}
                                setUserData={setUserData}
                                t={t}
                                locale={locale}
                                setLocale={setLocale}
                                LOCALES={LOCALES}
                                LOCALE_NAMES={LOCALE_NAMES}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Tab content ───────────────────────────────────────────────────────────────

interface TabContentProps {
    tab: SettingsTab;
    userData: {
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
        systemPrompt: string | null;
        locale: Locale;
    } | null;
    setUserData: React.Dispatch<React.SetStateAction<TabContentProps["userData"]>>;
    t: (key: string) => string;
    locale: Locale;
    setLocale: (l: Locale) => void;
    LOCALES: readonly Locale[];
    LOCALE_NAMES: Record<Locale, string>;
}

function TabContent({ tab, userData, setUserData, t, locale, setLocale, LOCALES, LOCALE_NAMES }: TabContentProps) {
    switch (tab) {
        case "profile":   return <ProfileTab userData={userData} setUserData={setUserData} t={t} />;
        case "account":   return <AccountTab t={t} />;
        case "billing":   return <BillingTab />;
        case "system-prompt": return <SystemPromptTab userData={userData} t={t} />;
        case "appearance":    return <AppearanceTab userData={userData} locale={locale} setLocale={setLocale} LOCALES={LOCALES} LOCALE_NAMES={LOCALE_NAMES} t={t} />;
        case "memory":    return <MemorySection />;
        case "knowledge": return <KnowledgeSection />;
        case "scheduled": return <ScheduledAgentsSection />;
        case "usage":     return <UsageTab t={t} />;
        case "danger":    return <DangerTab t={t} />;
    }
}

// ── Profile tab ───────────────────────────────────────────────────────────────

function ProfileTab({ userData, setUserData: _setUserData, t }: {
    userData: TabContentProps["userData"];
    setUserData: TabContentProps["setUserData"];
    t: (key: string) => string;
}) {
    const [avatarPreview, setAvatarPreview] = useState<string | null>(userData?.image ?? null);
    const [avatarFb, setAvatarFb] = useState<Feedback>(null);
    const [avatarLoading, setAvatarLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState(userData?.name ?? "");
    const [email, setEmail] = useState(userData?.email ?? "");
    const [profileFb, setProfileFb] = useState<Feedback>(null);
    const [profileLoading, setProfileLoading] = useState(false);

    const initials = name
        ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
        : (email?.[0] ?? "U").toUpperCase();

    const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!allowed.includes(file.type)) { setAvatarFb({ type: "err", text: t("profile.photo.unsupportedFormat") }); return; }
        if (file.size > 10 * 1024 * 1024) { setAvatarFb({ type: "err", text: t("profile.photo.tooLarge") }); return; }
        setAvatarLoading(true);
        setAvatarFb(null);
        try {
            const resized = await resizeToSquare(file, 256);
            setAvatarPreview(resized);
            const res = await fetch("/api/user/avatar", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: resized }),
            });
            const data = await res.json();
            setAvatarFb(res.ok ? { type: "ok", text: t("profile.photo.updated") } : { type: "err", text: data.error });
        } catch {
            setAvatarFb({ type: "err", text: t("profile.photo.processFailed") });
        } finally {
            setAvatarLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleRemoveAvatar = async () => {
        if (!avatarPreview) return;
        setAvatarLoading(true);
        setAvatarFb(null);
        const res = await fetch("/api/user/avatar", { method: "DELETE" });
        if (res.ok) { setAvatarPreview(null); setAvatarFb({ type: "ok", text: t("profile.photo.removed") }); }
        else { setAvatarFb({ type: "err", text: t("profile.photo.removeFailed") }); }
        setAvatarLoading(false);
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setProfileLoading(true);
        setProfileFb(null);
        const res = await fetch("/api/user/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.trim(), email: email.trim() }),
        });
        const data = await res.json();
        setProfileLoading(false);
        setProfileFb(res.ok ? { type: "ok", text: t("profile.info.updated") } : { type: "err", text: data.error });
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-base font-semibold text-white">Profile</h2>
                <p className="text-sm text-gray-500 mt-1">Manage your account information and avatar.</p>
            </div>

            {/* Avatar */}
            <div className="flex items-center gap-5">
                <div className="relative shrink-0">
                    <div className={`w-20 h-20 rounded-full overflow-hidden ${avatarLoading ? "opacity-60" : ""} transition-opacity`}>
                        {avatarPreview ? (
                            <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center font-bold text-white text-2xl select-none">
                                {initials}
                            </div>
                        )}
                    </div>
                    {avatarLoading && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                            <Loader2 size={16} className="animate-spin text-white" />
                        </div>
                    )}
                </div>
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={avatarLoading}
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-60 text-gray-300 hover:text-white text-sm rounded-lg transition-colors border border-gray-700"
                        >
                            <Camera size={13} />
                            {avatarPreview ? t("profile.photo.change") : t("profile.photo.upload")}
                        </button>
                        {avatarPreview && (
                            <button
                                type="button"
                                disabled={avatarLoading}
                                onClick={handleRemoveAvatar}
                                className="px-3 py-1.5 border border-gray-700 hover:bg-gray-800 disabled:opacity-60 text-gray-400 hover:text-red-400 text-sm rounded-lg transition-colors"
                            >
                                Remove
                            </button>
                        )}
                    </div>
                    <p className="text-xs text-gray-500">{t("profile.photo.hint")}</p>
                    {avatarFb && <Alert fb={avatarFb} />}
                </div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleAvatarFileChange} />
            </div>

            {/* Profile form */}
            <form onSubmit={handleUpdateProfile} className="space-y-4">
                <Alert fb={profileFb} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block mb-1.5 text-sm text-gray-400">{t("profile.info.name")}</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="w-full p-2.5 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-white"
                        />
                    </div>
                    <div>
                        <label className="block mb-1.5 text-sm text-gray-400">{t("profile.info.email")}</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full p-2.5 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-white"
                        />
                    </div>
                </div>
                <button
                    type="submit"
                    disabled={profileLoading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
                >
                    {profileLoading ? t("profile.info.saving") : t("profile.info.save")}
                </button>
            </form>
        </div>
    );
}

// ── Account (Security) tab ────────────────────────────────────────────────────

function AccountTab({ t }: { t: (key: string) => string }) {
    const [currentPw, setCurrentPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [pwFb, setPwFb] = useState<Feedback>(null);
    const [pwLoading, setPwLoading] = useState(false);

    const [sessionFb, setSessionFb] = useState<Feedback>(null);
    const [sessionLoading, setSessionLoading] = useState(false);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPw !== confirmPw) { setPwFb({ type: "err", text: t("profile.password.mismatch") }); return; }
        if (newPw.length < 8) { setPwFb({ type: "err", text: t("profile.password.tooShort") }); return; }
        setPwLoading(true);
        setPwFb(null);
        const res = await fetch("/api/user/password", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
        });
        const data = await res.json();
        setPwLoading(false);
        if (res.ok) {
            setPwFb({ type: "ok", text: t("profile.password.changed") });
            setCurrentPw(""); setNewPw(""); setConfirmPw("");
        } else {
            setPwFb({ type: "err", text: data.error });
        }
    };

    const handleRevokeAllSessions = async () => {
        if (!window.confirm(t("profile.session.confirmRevoke"))) return;
        setSessionLoading(true);
        setSessionFb(null);
        const res = await fetch("/api/user/sessions", { method: "POST" });
        setSessionLoading(false);
        setSessionFb(res.ok
            ? { type: "ok", text: t("profile.session.revoked") }
            : { type: "err", text: t("profile.session.revokeFailed") }
        );
    };

    return (
        <div className="space-y-8">
            {/* Change password */}
            <div className="space-y-4">
                <div>
                    <h2 className="text-base font-semibold text-white flex items-center gap-2">
                        <Lock size={16} className="text-yellow-400" /> {t("profile.password.title")}
                    </h2>
                </div>
                <form onSubmit={handleChangePassword} className="space-y-3">
                    <Alert fb={pwFb} />
                    {[
                        { label: t("profile.password.current"), value: currentPw, set: setCurrentPw },
                        { label: t("profile.password.newPw"), value: newPw, set: setNewPw },
                        { label: t("profile.password.confirm"), value: confirmPw, set: setConfirmPw },
                    ].map(({ label, value, set }) => (
                        <div key={label}>
                            <label className="block mb-1.5 text-sm text-gray-400">{label}</label>
                            <input
                                type="password"
                                value={value}
                                onChange={(e) => set(e.target.value)}
                                required
                                className="w-full p-2.5 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none text-sm text-white"
                            />
                        </div>
                    ))}
                    <button
                        type="submit"
                        disabled={pwLoading}
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                        {pwLoading ? t("profile.password.changing") : t("profile.password.change")}
                    </button>
                </form>
            </div>

            <div className="h-px bg-gray-800" />

            {/* Sessions */}
            <div className="space-y-3">
                <div>
                    <h2 className="text-base font-semibold text-white flex items-center gap-2">
                        <ShieldAlert size={16} className="text-orange-400" /> {t("profile.session.title")}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">{t("profile.session.desc")}</p>
                </div>
                <Alert fb={sessionFb} />
                <button
                    type="button"
                    onClick={handleRevokeAllSessions}
                    disabled={sessionLoading}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
                >
                    {sessionLoading ? t("profile.session.processing") : t("profile.session.revokeAll")}
                </button>
            </div>
        </div>
    );
}

// ── System Prompt tab ─────────────────────────────────────────────────────────

function SystemPromptTab({ userData, t }: { userData: TabContentProps["userData"]; t: (key: string) => string }) {
    const [systemPrompt, setSystemPrompt] = useState(userData?.systemPrompt ?? "");
    const [promptFb, setPromptFb] = useState<Feedback>(null);
    const [promptLoading, setPromptLoading] = useState(false);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setPromptLoading(true);
        setPromptFb(null);
        const res = await fetch("/api/user/system-prompt", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ systemPrompt }),
        });
        const data = await res.json();
        setPromptLoading(false);
        setPromptFb(res.ok ? { type: "ok", text: t("profile.systemPrompt.saved") } : { type: "err", text: data.error });
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <MessageSquare size={16} className="text-purple-400" /> {t("profile.systemPrompt.title")}
                </h2>
                <p className="text-sm text-gray-500 mt-1">{t("profile.systemPrompt.desc")}</p>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
                <Alert fb={promptFb} />
                <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={6}
                    placeholder={t("profile.systemPrompt.placeholder")}
                    className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm text-white resize-none"
                />
                <button
                    type="submit"
                    disabled={promptLoading}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
                >
                    {promptLoading ? t("profile.systemPrompt.saving") : t("profile.systemPrompt.save")}
                </button>
            </form>
        </div>
    );
}

// ── Appearance tab ────────────────────────────────────────────────────────────

function AppearanceTab({ userData, locale, setLocale, LOCALES, LOCALE_NAMES, t }: {
    userData: TabContentProps["userData"];
    locale: Locale;
    setLocale: (l: Locale) => void;
    LOCALES: readonly Locale[];
    LOCALE_NAMES: Record<Locale, string>;
    t: (key: string) => string;
}) {
    const [selectedLocale, setSelectedLocale] = useState<Locale>(userData?.locale ?? locale);
    const [localeFb, setLocaleFb] = useState<Feedback>(null);
    const [localeLoading, setLocaleLoading] = useState(false);

    const handleSaveLocale = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocaleLoading(true);
        setLocaleFb(null);
        const res = await fetch("/api/user/locale", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locale: selectedLocale }),
        });
        const data = await res.json();
        setLocaleLoading(false);
        if (res.ok) {
            setLocale(selectedLocale);
            setLocaleFb({ type: "ok", text: t("profile.language.saved") });
        } else {
            setLocaleFb({ type: "err", text: data.error });
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <Globe size={16} className="text-cyan-400" /> {t("profile.language.title")}
                </h2>
                <p className="text-sm text-gray-500 mt-1">{t("profile.language.desc")}</p>
            </div>
            <form onSubmit={handleSaveLocale} className="space-y-4">
                <Alert fb={localeFb} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {LOCALES.map((loc) => (
                        <label
                            key={loc}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                selectedLocale === loc
                                    ? "border-cyan-500 bg-cyan-900/20"
                                    : "border-gray-700 hover:border-gray-600 hover:bg-gray-800/50"
                            }`}
                        >
                            <input
                                type="radio"
                                name="locale"
                                value={loc}
                                checked={selectedLocale === loc}
                                onChange={() => setSelectedLocale(loc)}
                                className="accent-cyan-500"
                            />
                            <span className={`text-sm font-medium ${selectedLocale === loc ? "text-cyan-300" : "text-gray-300"}`}>
                                {LOCALE_NAMES[loc]}
                            </span>
                        </label>
                    ))}
                </div>
                <button
                    type="submit"
                    disabled={localeLoading || selectedLocale === locale}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
                >
                    {localeLoading ? t("profile.language.saving") : t("profile.language.save")}
                </button>
            </form>
        </div>
    );
}

// ── Billing tab ───────────────────────────────────────────────────────────────

interface BillingPlan {
    id: string;
    name: string;
    displayName: string;
    stripePriceId: string | null;
    monthlyPrice: number;
    features: string[];
    messageLimit: number | null;
    tokenLimit: number | null;
    active: boolean;
}

interface BillingSubscription {
    id: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
}

function billingPlanIcon(name: string) {
    if (name === "pro") return <Zap size={16} className="text-blue-400" />;
    if (name === "ultra") return <Crown size={16} className="text-purple-400" />;
    return <Star size={16} className="text-gray-400" />;
}

function billingStatusBadge(status: string) {
    const map: Record<string, string> = {
        active: "bg-green-500/20 text-green-300 border-green-500/30",
        trialing: "bg-blue-500/20 text-blue-300 border-blue-500/30",
        past_due: "bg-red-500/20 text-red-300 border-red-500/30",
        canceled: "bg-gray-700 text-gray-400 border-gray-600",
        incomplete: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    };
    return map[status] || "bg-gray-700 text-gray-400 border-gray-600";
}

function BillingTab() {
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [plans, setPlans] = useState<BillingPlan[]>([]);
    const [activePlan, setActivePlan] = useState<BillingPlan | null>(null);
    const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            fetch("/api/subscription/plans").then((r) => r.json()),
            fetch("/api/subscription/status").then((r) => r.json()),
        ])
            .then(([plansData, statusData]) => {
                setEnabled(Boolean(plansData?.enabled));
                setPlans(plansData?.plans ?? []);
                setActivePlan(statusData?.plan ?? null);
                setSubscription(statusData?.subscription ?? null);
            })
            .catch(() => setEnabled(false))
            .finally(() => setLoading(false));
    }, []);

    const handleUpgrade = async (plan: BillingPlan) => {
        if (!plan.stripePriceId) return;
        setActionLoading(plan.id);
        try {
            const res = await fetch("/api/subscription/create-checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planId: plan.id }),
            });
            const data = await res.json();
            if (data.url) { window.location.assign(data.url); return; }
        } catch { /* fall through to reset */ }
        setActionLoading(null);
    };

    const handleManage = async () => {
        setActionLoading("portal");
        try {
            const res = await fetch("/api/subscription/portal", { method: "POST" });
            const data = await res.json();
            if (data.url) { window.location.assign(data.url); return; }
        } catch { /* fall through to reset */ }
        setActionLoading(null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-gray-500" />
            </div>
        );
    }

    if (!enabled) {
        return (
            <div className="space-y-4">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <CreditCard size={16} className="text-emerald-400" /> Billing
                </h2>
                <div className="bg-gray-800 rounded-xl p-6 text-center">
                    <p className="text-sm text-gray-400">Subscriptions are not enabled on this workspace.</p>
                </div>
            </div>
        );
    }

    const isCurrentPlan = (plan: BillingPlan) => activePlan?.id === plan.id;

    return (
        <div className="space-y-4">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <CreditCard size={16} className="text-emerald-400" /> Billing
            </h2>

            {/* Current plan banner */}
            {activePlan && (
                <div className="bg-gray-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gray-700 flex items-center justify-center shrink-0">
                            {billingPlanIcon(activePlan.name)}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-white text-sm">{activePlan.displayName}</span>
                                {subscription && (
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border capitalize ${billingStatusBadge(subscription.status)}`}>
                                        {subscription.status}
                                    </span>
                                )}
                                {subscription?.cancelAtPeriodEnd && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-orange-500/20 text-orange-300 border-orange-500/30">
                                        Cancels soon
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {activePlan.monthlyPrice === 0 ? "Free plan" : `$${activePlan.monthlyPrice.toFixed(2)}/month`}
                                {subscription?.currentPeriodEnd && (
                                    <> &middot; Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</>
                                )}
                            </p>
                        </div>
                    </div>
                    {subscription && (
                        <button
                            onClick={handleManage}
                            disabled={actionLoading === "portal"}
                            className="flex items-center gap-2 px-3.5 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-xs text-white transition-colors shrink-0"
                        >
                            <ExternalLink size={13} />
                            {actionLoading === "portal" ? "Opening..." : "Manage Billing"}
                        </button>
                    )}
                </div>
            )}

            {/* Plans */}
            <div className="space-y-3">
                {plans.map((plan) => (
                    <div
                        key={plan.id}
                        className={`rounded-xl border p-4 ${
                            isCurrentPlan(plan) ? "border-blue-500/40 bg-blue-500/5" : "border-gray-700 bg-gray-800"
                        }`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-gray-700/70 flex items-center justify-center shrink-0">
                                    {billingPlanIcon(plan.name)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-white text-sm">{plan.displayName}</h3>
                                        {isCurrentPlan(plan) && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white">Current</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {plan.monthlyPrice === 0 ? "Free" : `$${plan.monthlyPrice.toFixed(0)}/month`}
                                    </p>
                                </div>
                            </div>
                            <div className="shrink-0">
                                {isCurrentPlan(plan) ? (
                                    <span className="text-xs text-gray-500 px-3 py-1.5">Active</span>
                                ) : plan.monthlyPrice === 0 ? (
                                    <span className="text-xs text-gray-500 px-3 py-1.5">Included</span>
                                ) : plan.stripePriceId ? (
                                    <button
                                        onClick={() => handleUpgrade(plan)}
                                        disabled={actionLoading === plan.id}
                                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                                            plan.name === "ultra"
                                                ? "bg-purple-600 hover:bg-purple-700 text-white"
                                                : "bg-blue-600 hover:bg-blue-700 text-white"
                                        }`}
                                    >
                                        <CreditCard size={13} />
                                        {actionLoading === plan.id ? "Redirecting..." : "Upgrade"}
                                    </button>
                                ) : (
                                    <span className="text-xs text-gray-600 px-3 py-1.5">Coming soon</span>
                                )}
                            </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {plan.messageLimit !== null ? (
                                <div className="flex items-center gap-2 text-xs text-gray-300">
                                    <Check size={12} className="text-green-400 shrink-0" />
                                    {plan.messageLimit.toLocaleString()} messages / month
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-xs text-gray-300">
                                    <Check size={12} className="text-green-400 shrink-0" />
                                    Unlimited messages
                                </div>
                            )}
                            {plan.tokenLimit !== null && (
                                <div className="flex items-center gap-2 text-xs text-gray-300">
                                    <Check size={12} className="text-green-400 shrink-0" />
                                    {plan.tokenLimit.toLocaleString()} tokens / month
                                </div>
                            )}
                            {plan.features.map((f, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs text-gray-300">
                                    <Check size={12} className="text-green-400 shrink-0" />
                                    {f}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <p className="text-center text-[11px] text-gray-600 pt-1">
                Payments are processed securely by Stripe. Cancel anytime from the billing portal.
            </p>
        </div>
    );
}

// ── Usage tab ─────────────────────────────────────────────────────────────────

const USAGE_RANGES = [7, 30, 90];

interface UsageData {
    range: number;
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalEstimatedCostUsd: number;
    monthlyTokenQuota: number | null;
    monthTokensUsed: number;
    byModel: {
        model: string;
        requests: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
    }[];
    dailyStats: { date: string; tokens: number; cost: number; requests: number }[];
}

function UsageTab({ t }: { t: (key: string) => string }) {
    const [stats, setStats] = useState<{
        totalChats: number;
        totalMessages: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        last7Days: { date: string; label: string; messages: number }[];
        topModels: { model: string; count: number; tokens: number }[];
    } | null>(null);
    const [usage, setUsage] = useState<UsageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState(30);

    useEffect(() => {
        fetch("/api/user/stats")
            .then((r) => r.json())
            .then((d) => setStats(d))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetch(`/api/user/usage?range=${range}`)
            .then((r) => r.json())
            .then((d) => setUsage(d))
            .catch(() => {});
    }, [range]);

    const models = (usage?.byModel ?? []).slice(0, 8).map((m) => ({ ...m, label: shortModel(m.model) }));
    const quota = usage?.monthlyTokenQuota ?? null;
    const quotaPct = quota && quota > 0 ? Math.min(100, ((usage?.monthTokensUsed ?? 0) / quota) * 100) : 0;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <BarChart2 size={16} className="text-green-400" /> {t("profile.stats.title")}
                </h2>
                <div className="flex items-center gap-1">
                    {USAGE_RANGES.map((r) => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                range === r ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                            }`}
                        >
                            {r}d
                        </button>
                    ))}
                </div>
            </div>
            {loading ? (
                <div className="space-y-3 animate-pulse">
                    <div className="grid grid-cols-3 gap-3">
                        {[0, 1, 2].map(i => <div key={i} className="h-16 bg-gray-800 rounded-lg" />)}
                    </div>
                    <div className="h-24 bg-gray-800 rounded-lg" />
                </div>
            ) : stats ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-gray-800 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-white">{stats.totalChats}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{t("profile.stats.totalChats")}</p>
                        </div>
                        <div className="bg-gray-800 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-white">{stats.totalMessages}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{t("profile.stats.totalMessages")}</p>
                        </div>
                        <div className="bg-gray-800 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-white">{fmtTokens(stats.totalInputTokens + stats.totalOutputTokens)}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{t("profile.stats.totalTokens")}</p>
                        </div>
                        <div className="bg-gray-800 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-yellow-400 flex items-center justify-center gap-1">
                                <DollarSign size={16} />
                                {fmtUsd(usage?.totalEstimatedCostUsd ?? 0).replace("$", "")}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">{t("profile.stats.estimatedCost")}</p>
                        </div>
                    </div>

                    {/* Monthly token quota */}
                    {quota && quota > 0 && (
                        <div className="bg-gray-800 rounded-xl p-4">
                            <div className="flex justify-between text-xs text-gray-500 mb-2">
                                <span>{t("profile.stats.monthlyQuota")}</span>
                                <span className={quotaPct >= 90 ? "text-red-400" : "text-gray-400"}>
                                    {fmtTokens(usage?.monthTokensUsed ?? 0)} / {fmtTokens(quota)} {t("profile.stats.quotaUsed")}
                                </span>
                            </div>
                            <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${quotaPct >= 90 ? "bg-red-500" : quotaPct >= 70 ? "bg-yellow-500" : "bg-green-500"}`}
                                    style={{ width: `${quotaPct}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Daily message volume (last 7 days, all-time) */}
                    {(() => {
                        const maxMsg = Math.max(...stats.last7Days.map(d => d.messages), 1);
                        return (
                            <div className="bg-gray-800 rounded-xl p-4">
                                <p className="text-xs text-gray-500 mb-3">{t("profile.stats.last7Days")}</p>
                                <div className="flex items-end gap-1 h-20">
                                    {stats.last7Days.map((day) => (
                                        <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                                            <div
                                                className="w-full bg-blue-600 rounded-t-sm min-h-[2px] transition-all"
                                                style={{ height: `${Math.max(2, (day.messages / maxMsg) * 64)}px` }}
                                                title={`${day.messages} messages`}
                                            />
                                            <span className="text-[10px] text-gray-600">{day.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Daily token cost trend */}
                    <div className="bg-gray-800 rounded-xl p-4">
                        <p className="text-xs text-gray-500 mb-3">{t("profile.stats.dailyCost")}</p>
                        <LineChart data={usage?.dailyStats ?? []} valueKey="cost" stroke="#eab308" formatVal={fmtUsd} />
                    </div>

                    {/* Tokens & cost by model */}
                    {models.length > 0 && (
                        <div className="bg-gray-800 rounded-xl p-4 space-y-5">
                            <div>
                                <p className="text-xs text-gray-500 mb-3">{t("profile.stats.tokensByModel")}</p>
                                <BarChart data={models} valueKey="totalTokens" labelKey="label" color="bg-blue-500" formatVal={fmtTokens} />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-3">{t("profile.stats.costByModel")}</p>
                                <BarChart data={models} valueKey="estimatedCostUsd" labelKey="label" color="bg-yellow-500" formatVal={fmtUsd} />
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-sm text-gray-500">{t("profile.stats.failed")}</p>
            )}
        </div>
    );
}

// ── Danger Zone tab ───────────────────────────────────────────────────────────

function DangerTab({ t }: { t: (key: string) => string }) {
    const [deletePw, setDeletePw] = useState("");
    const [deleteFb, setDeleteFb] = useState<Feedback>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    const handleDeleteAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!window.confirm(t("profile.delete.confirm"))) return;
        setDeleteLoading(true);
        setDeleteFb(null);
        const res = await fetch("/api/user/account", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: deletePw }),
        });
        const data = await res.json();
        if (res.ok) {
            await signOut({ callbackUrl: "/login" });
        } else {
            setDeleteLoading(false);
            setDeleteFb({ type: "err", text: data.error });
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-base font-semibold text-red-400 flex items-center gap-2">
                    <Trash2 size={16} /> {t("profile.delete.title")}
                </h2>
                <p className="text-sm text-gray-500 mt-1">{t("profile.delete.desc")}</p>
            </div>
            <div className="border border-red-900/40 rounded-xl p-4 bg-red-900/5">
                <form onSubmit={handleDeleteAccount} className="space-y-3">
                    <Alert fb={deleteFb} />
                    <div>
                        <label className="block mb-1.5 text-sm text-gray-300">{t("profile.delete.confirmLabel")}</label>
                        <input
                            type="password"
                            value={deletePw}
                            onChange={(e) => setDeletePw(e.target.value)}
                            required
                            placeholder={t("profile.delete.placeholder")}
                            className="w-full p-2.5 bg-gray-800 border border-red-900/50 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm text-white"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={deleteLoading}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                        {deleteLoading ? t("profile.delete.deleting") : t("profile.delete.delete")}
                    </button>
                </form>
            </div>
        </div>
    );
}
