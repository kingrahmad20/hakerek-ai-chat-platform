"use client";
import { useState } from "react";
import { Terminal, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { saveSlashCommands } from "@/app/admin/actions";
import type { SlashCommand } from "@/app/admin/actions";

interface SlashCommandsTabProps {
    commands: SlashCommand[];
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

export function SlashCommandsTab({ commands: initialCommands }: SlashCommandsTabProps) {
    const [commands, setCommands] = useState<SlashCommand[]>(initialCommands);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editCommand, setEditCommand] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editPrompt, setEditPrompt] = useState("");
    const [adding, setAdding] = useState(false);
    const [newCommand, setNewCommand] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [newPrompt, setNewPrompt] = useState("");
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

    const persist = async (updated: SlashCommand[]) => {
        setSaving(true);
        setFeedback(null);
        const fd = new FormData();
        fd.set("slashCommands", JSON.stringify(updated));
        const result = await saveSlashCommands(null, fd);
        setSaving(false);
        if (result) setFeedback({ ok: result.ok, text: result.message });
        return result;
    };

    const toggle = async (id: string) => {
        const updated = commands.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c);
        setCommands(updated);
        await persist(updated);
    };

    const remove = async (id: string) => {
        if (!window.confirm("Delete this slash command?")) return;
        const updated = commands.filter(c => c.id !== id);
        setCommands(updated);
        await persist(updated);
    };

    const startEdit = (cmd: SlashCommand) => {
        setAdding(false);
        setEditingId(cmd.id);
        setEditCommand(cmd.command);
        setEditDescription(cmd.description);
        setEditPrompt(cmd.prompt);
    };

    const saveEdit = async () => {
        if (!editCommand.trim() || !editPrompt.trim()) return;
        const updated = commands.map(c =>
            c.id === editingId
                ? { ...c, command: editCommand.trim(), description: editDescription.trim(), prompt: editPrompt.trim() }
                : c
        );
        setCommands(updated);
        setEditingId(null);
        await persist(updated);
    };

    const addCommand = async () => {
        if (!newCommand.trim() || !newPrompt.trim()) return;
        const cmd: SlashCommand = {
            id: crypto.randomUUID(),
            command: newCommand.trim(),
            description: newDescription.trim(),
            prompt: newPrompt.trim(),
            enabled: true,
        };
        const updated = [...commands, cmd];
        setCommands(updated);
        setNewCommand("");
        setNewDescription("");
        setNewPrompt("");
        setAdding(false);
        await persist(updated);
    };

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Terminal size={20} className="text-blue-400" />
                        Slash Commands
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Users can type <code className="px-1 py-0.5 bg-gray-800 rounded text-blue-300 text-xs">/command</code> in the chat input to instantly apply a prompt template.
                        Use <code className="px-1 py-0.5 bg-gray-800 rounded text-blue-300 text-xs">{"{input}"}</code> in the prompt to capture text typed after the command.
                    </p>
                </div>
                <button
                    onClick={() => { setAdding(true); setEditingId(null); }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
                >
                    <Plus size={15} /> Add Command
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

            {commands.length === 0 && !adding && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
                    <Terminal size={36} className="text-gray-700 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 mb-1">No slash commands yet.</p>
                    <p className="text-xs text-gray-600">Click &ldquo;Add Command&rdquo; to create the first one.</p>
                </div>
            )}

            <div className="space-y-3">
                {commands.map((cmd) => (
                    <div
                        key={cmd.id}
                        className={`bg-gray-900 border rounded-xl overflow-hidden transition-opacity ${
                            cmd.enabled ? "border-gray-700" : "border-gray-800 opacity-60"
                        }`}
                    >
                        {editingId === cmd.id ? (
                            <div className="p-4 space-y-3">
                                <p className="text-xs text-blue-400 font-medium">Edit Command</p>
                                <div className="flex gap-2 items-center">
                                    <span className="text-gray-400 text-sm font-mono">/</span>
                                    <input
                                        value={editCommand}
                                        onChange={e => setEditCommand(e.target.value.replace(/[^a-z0-9_-]/gi, ""))}
                                        placeholder="command-name"
                                        autoFocus
                                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <input
                                    value={editDescription}
                                    onChange={e => setEditDescription(e.target.value)}
                                    placeholder="Short description (shown in dropdown)"
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <textarea
                                    value={editPrompt}
                                    onChange={e => setEditPrompt(e.target.value)}
                                    rows={4}
                                    placeholder={`Prompt template, e.g. "Translate the following to English: {input}"`}
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
                                        disabled={saving || !editCommand.trim() || !editPrompt.trim()}
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
                                        <Toggle enabled={cmd.enabled} onToggle={() => toggle(cmd.id)} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <code className="text-sm font-mono font-semibold text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-900/50">
                                                    /{cmd.command}
                                                </code>
                                                {cmd.description && (
                                                    <span className="text-sm text-gray-400 truncate">{cmd.description}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    onClick={() => startEdit(cmd)}
                                                    title="Edit"
                                                    className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
                                                >
                                                    <Pencil size={13} />
                                                </button>
                                                <button
                                                    onClick={() => remove(cmd.id)}
                                                    title="Delete"
                                                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-md transition-colors"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed line-clamp-2 font-mono text-xs">{cmd.prompt}</p>
                                        <span className={`mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                            cmd.enabled
                                                ? "bg-green-900/30 text-green-400 border border-green-800"
                                                : "bg-gray-800 text-gray-500 border border-gray-700"
                                        }`}>
                                            {cmd.enabled ? "Active" : "Inactive"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {adding && (
                    <div className="bg-gray-900 border border-blue-700/50 rounded-xl p-4 space-y-3">
                        <p className="text-sm font-medium text-blue-400">New Slash Command</p>
                        <div className="flex gap-2 items-center">
                            <span className="text-gray-400 text-sm font-mono">/</span>
                            <input
                                value={newCommand}
                                onChange={e => setNewCommand(e.target.value.replace(/[^a-z0-9_-]/gi, ""))}
                                placeholder="command-name"
                                autoFocus
                                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <input
                            value={newDescription}
                            onChange={e => setNewDescription(e.target.value)}
                            placeholder='Short description (e.g. "Translate text to English")'
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <textarea
                            value={newPrompt}
                            onChange={e => setNewPrompt(e.target.value)}
                            rows={4}
                            placeholder={`Prompt template (e.g. "Translate the following to English: {input}")\nUse {input} where the user's text should be inserted.`}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => { setAdding(false); setNewCommand(""); setNewDescription(""); setNewPrompt(""); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
                            >
                                <X size={13} /> Cancel
                            </button>
                            <button
                                onClick={addCommand}
                                disabled={saving || !newCommand.trim() || !newPrompt.trim()}
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
