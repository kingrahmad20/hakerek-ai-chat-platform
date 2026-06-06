"use client";
import { useState } from "react";
import { LayoutTemplate, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { saveConversationTemplates } from "@/app/admin/actions";
import type { ConversationTemplate } from "@/app/admin/actions";

interface TemplatesTabProps {
    templates: ConversationTemplate[];
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

export function TemplatesTab({ templates: initialTemplates }: TemplatesTabProps) {
    const [templates, setTemplates] = useState<ConversationTemplate[]>(initialTemplates);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editPrompt, setEditPrompt] = useState("");
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState("");
    const [newPrompt, setNewPrompt] = useState("");
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

    const persist = async (updated: ConversationTemplate[]) => {
        setSaving(true);
        setFeedback(null);
        const fd = new FormData();
        fd.set("conversationTemplates", JSON.stringify(updated));
        const result = await saveConversationTemplates(null, fd);
        setSaving(false);
        if (result) setFeedback({ ok: result.ok, text: result.message });
        return result;
    };

    const toggle = async (id: string) => {
        const updated = templates.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t);
        setTemplates(updated);
        await persist(updated);
    };

    const remove = async (id: string) => {
        if (!window.confirm("Delete this template?")) return;
        const updated = templates.filter(t => t.id !== id);
        setTemplates(updated);
        await persist(updated);
    };

    const startEdit = (tpl: ConversationTemplate) => {
        setAdding(false);
        setEditingId(tpl.id);
        setEditName(tpl.name);
        setEditPrompt(tpl.prompt);
    };

    const saveEdit = async () => {
        if (!editName.trim() || !editPrompt.trim()) return;
        const updated = templates.map(t =>
            t.id === editingId ? { ...t, name: editName.trim(), prompt: editPrompt.trim() } : t
        );
        setTemplates(updated);
        setEditingId(null);
        await persist(updated);
    };

    const addTemplate = async () => {
        if (!newName.trim() || !newPrompt.trim()) return;
        const newTpl: ConversationTemplate = {
            id: crypto.randomUUID(),
            name: newName.trim(),
            prompt: newPrompt.trim(),
            enabled: true,
        };
        const updated = [...templates, newTpl];
        setTemplates(updated);
        setNewName("");
        setNewPrompt("");
        setAdding(false);
        await persist(updated);
    };

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <LayoutTemplate size={20} className="text-blue-400" />
                        Conversation Templates
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Enabled templates appear as quick-start buttons on the new chat screen.
                    </p>
                </div>
                <button
                    onClick={() => { setAdding(true); setEditingId(null); }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
                >
                    <Plus size={15} /> Add Template
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

            {templates.length === 0 && !adding && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
                    <LayoutTemplate size={36} className="text-gray-700 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 mb-1">No templates yet.</p>
                    <p className="text-xs text-gray-600">Click &ldquo;Add Template&rdquo; to create the first one.</p>
                </div>
            )}

            <div className="space-y-3">
                {templates.map((tpl) => (
                    <div
                        key={tpl.id}
                        className={`bg-gray-900 border rounded-xl overflow-hidden transition-opacity ${
                            tpl.enabled ? "border-gray-700" : "border-gray-800 opacity-60"
                        }`}
                    >
                        {editingId === tpl.id ? (
                            <div className="p-4 space-y-3">
                                <p className="text-xs text-blue-400 font-medium">Edit Template</p>
                                <input
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    placeholder="Template name (e.g. Debug code)"
                                    autoFocus
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <textarea
                                    value={editPrompt}
                                    onChange={e => setEditPrompt(e.target.value)}
                                    rows={4}
                                    placeholder="Prompt text the user will send..."
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
                                        disabled={saving || !editName.trim() || !editPrompt.trim()}
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
                                        <Toggle enabled={tpl.enabled} onToggle={() => toggle(tpl.id)} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-semibold text-white leading-snug">{tpl.name}</p>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    onClick={() => startEdit(tpl)}
                                                    title="Edit"
                                                    className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
                                                >
                                                    <Pencil size={13} />
                                                </button>
                                                <button
                                                    onClick={() => remove(tpl.id)}
                                                    title="Delete"
                                                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-md transition-colors"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-400 mt-1.5 leading-relaxed line-clamp-2">{tpl.prompt}</p>
                                        <span className={`mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                            tpl.enabled
                                                ? "bg-green-900/30 text-green-400 border border-green-800"
                                                : "bg-gray-800 text-gray-500 border border-gray-700"
                                        }`}>
                                            {tpl.enabled ? "Active" : "Inactive"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {adding && (
                    <div className="bg-gray-900 border border-blue-700/50 rounded-xl p-4 space-y-3">
                        <p className="text-sm font-medium text-blue-400">New Template</p>
                        <input
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder='Button label (e.g. "Debug code")'
                            autoFocus
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <textarea
                            value={newPrompt}
                            onChange={e => setNewPrompt(e.target.value)}
                            rows={4}
                            placeholder='Prompt the user sends (e.g. "Help me debug the following code:")'
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => { setAdding(false); setNewName(""); setNewPrompt(""); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
                            >
                                <X size={13} /> Cancel
                            </button>
                            <button
                                onClick={addTemplate}
                                disabled={saving || !newName.trim() || !newPrompt.trim()}
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
