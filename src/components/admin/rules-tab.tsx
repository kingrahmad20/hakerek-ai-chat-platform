"use client";
import { useState } from "react";
import { ShieldCheck, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { saveAiRules } from "@/app/admin/actions";
import type { AiRule } from "@/app/admin/actions";

interface RulesTabProps {
    rules: AiRule[];
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

export function RulesTab({ rules: initialRules }: RulesTabProps) {
    const [rules, setRules] = useState<AiRule[]>(initialRules);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editContent, setEditContent] = useState("");
    const [adding, setAdding] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newContent, setNewContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

    const persist = async (updated: AiRule[]) => {
        setSaving(true);
        setFeedback(null);
        const fd = new FormData();
        fd.set("aiRules", JSON.stringify(updated));
        const result = await saveAiRules(null, fd);
        setSaving(false);
        if (result) setFeedback({ ok: result.ok, text: result.message });
        return result;
    };

    const toggle = async (id: string) => {
        const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
        setRules(updated);
        await persist(updated);
    };

    const remove = async (id: string) => {
        if (!window.confirm("Delete this rule?")) return;
        const updated = rules.filter(r => r.id !== id);
        setRules(updated);
        await persist(updated);
    };

    const startEdit = (rule: AiRule) => {
        setAdding(false);
        setEditingId(rule.id);
        setEditTitle(rule.title);
        setEditContent(rule.content);
    };

    const saveEdit = async () => {
        if (!editTitle.trim() || !editContent.trim()) return;
        const updated = rules.map(r =>
            r.id === editingId ? { ...r, title: editTitle.trim(), content: editContent.trim() } : r
        );
        setRules(updated);
        setEditingId(null);
        await persist(updated);
    };

    const addRule = async () => {
        if (!newTitle.trim() || !newContent.trim()) return;
        const newRule: AiRule = {
            id: crypto.randomUUID(),
            title: newTitle.trim(),
            content: newContent.trim(),
            enabled: true,
        };
        const updated = [...rules, newRule];
        setRules(updated);
        setNewTitle("");
        setNewContent("");
        setAdding(false);
        await persist(updated);
    };

    return (
        <div className="space-y-6 max-w-3xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <ShieldCheck size={20} className="text-blue-400" />
                        AI Rules
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Active rules will be included in every conversation, before the AI responds to the user.
                    </p>
                </div>
                <button
                    onClick={() => { setAdding(true); setEditingId(null); }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
                >
                    <Plus size={15} /> Add Rule
                </button>
            </div>

            {/* Feedback */}
            {feedback && (
                <p className={`text-sm px-3 py-2 rounded-lg border ${feedback.ok
                    ? "text-green-400 bg-green-900/20 border-green-800"
                    : "text-red-400 bg-red-900/20 border-red-800"
                }`}>
                    {feedback.text}
                </p>
            )}

            {/* Empty state */}
            {rules.length === 0 && !adding && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
                    <ShieldCheck size={36} className="text-gray-700 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 mb-1">No AI rules yet.</p>
                    <p className="text-xs text-gray-600">Click &quot;Add Rule&quot; to create the first rule.</p>
                </div>
            )}

            {/* Rule list */}
            <div className="space-y-3">
                {rules.map((rule) => (
                    <div
                        key={rule.id}
                        className={`bg-gray-900 border rounded-xl overflow-hidden transition-opacity ${
                            rule.enabled ? "border-gray-700" : "border-gray-800 opacity-60"
                        }`}
                    >
                        {editingId === rule.id ? (
                            <div className="p-4 space-y-3">
                                <p className="text-xs text-blue-400 font-medium">Edit Rule</p>
                                <input
                                    value={editTitle}
                                    onChange={e => setEditTitle(e.target.value)}
                                    placeholder="Rule name..."
                                    autoFocus
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <textarea
                                    value={editContent}
                                    onChange={e => setEditContent(e.target.value)}
                                    rows={4}
                                    placeholder="Detailed instructions for AI..."
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                />
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={() => setEditingId(null)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
                                    >
                                        <X size={13} /> Cancel
                                    </button>
                                    <button
                                        onClick={saveEdit}
                                        disabled={saving || !editTitle.trim() || !editContent.trim()}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition-colors"
                                    >
                                        <Check size={13} /> {saving ? "Saving..." : "Save"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="pt-0.5">
                                        <Toggle enabled={rule.enabled} onToggle={() => toggle(rule.id)} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-semibold text-white leading-snug">{rule.title}</p>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    onClick={() => startEdit(rule)}
                                                    title="Edit"
                                                    className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
                                                >
                                                    <Pencil size={13} />
                                                </button>
                                                <button
                                                    onClick={() => remove(rule.id)}
                                                    title="Delete"
                                                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-md transition-colors"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">{rule.content}</p>
                                        <span className={`mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                            rule.enabled
                                                ? "bg-green-900/30 text-green-400 border border-green-800"
                                                : "bg-gray-800 text-gray-500 border border-gray-700"
                                        }`}>
                                            {rule.enabled ? "Active" : "Inactive"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {/* Add new rule form */}
                {adding && (
                    <div className="bg-gray-900 border border-blue-700/50 rounded-xl p-4 space-y-3">
                        <p className="text-sm font-medium text-blue-400">New Rule</p>
                        <input
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            placeholder="Rule name (e.g. No Politics Discussion)"
                            autoFocus
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <textarea
                            value={newContent}
                            onChange={e => setNewContent(e.target.value)}
                            rows={4}
                            placeholder="Detailed instructions for AI (e.g. If the user asks about political topics, politely decline and redirect to a more neutral topic.)"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => { setAdding(false); setNewTitle(""); setNewContent(""); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
                            >
                                <X size={13} /> Cancel
                            </button>
                            <button
                                onClick={addRule}
                                disabled={saving || !newTitle.trim() || !newContent.trim()}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition-colors"
                            >
                                <Plus size={13} /> {saving ? "Saving..." : "Add"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
