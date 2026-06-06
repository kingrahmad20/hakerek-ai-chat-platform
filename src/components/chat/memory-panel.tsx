"use client";
import { useState, useEffect, useCallback } from "react";
import { X, Brain, Trash2, Plus, Pencil, Check, Loader2 } from "lucide-react";

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

interface MemoryPanelProps {
    onClose: () => void;
}

export function MemoryPanel({ onClose }: MemoryPanelProps) {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <Brain size={18} className="text-violet-400" />
                        <h2 className="text-sm font-semibold text-white">Long-term Memory</h2>
                        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                            {memories.length}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Description */}
                <p className="px-5 py-3 text-xs text-gray-500 border-b border-gray-800/60 shrink-0">
                    The AI automatically extracts and remembers important facts from your conversations. These are injected into every new chat.
                </p>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
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
                                        <button
                                            onClick={() => startEdit(m)}
                                            className="p-1 rounded text-gray-500 hover:text-gray-300 transition-colors"
                                        >
                                            <Pencil size={12} />
                                        </button>
                                        <button
                                            onClick={() => deleteMemory(m.id)}
                                            className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}

                    {/* Add new memory inline form */}
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

                {/* Footer */}
                <div className="shrink-0 px-5 py-3 border-t border-gray-800 flex justify-between items-center">
                    <button
                        onClick={() => setAddingNew(true)}
                        disabled={addingNew}
                        className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 disabled:opacity-40 transition-colors"
                    >
                        <Plus size={13} /> Add memory
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
