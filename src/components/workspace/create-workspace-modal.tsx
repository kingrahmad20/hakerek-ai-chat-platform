"use client";

import { useState } from "react";
import { X, Building2 } from "lucide-react";
import type { WorkspaceSummary } from "@/types";

interface Props {
    onClose: () => void;
    onCreated: (workspace: WorkspaceSummary) => void;
}

export function CreateWorkspaceModal({ onClose, onCreated }: Props) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/workspaces", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
            });
            if (!res.ok) {
                setError((await res.text()) || "Failed to create workspace");
                return;
            }
            const data = await res.json();
            onCreated(data);
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] px-4"
            onClick={onClose}
        >
            <div
                className="bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl border border-gray-800"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 pt-6 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                            <Building2 size={18} className="text-blue-400" />
                        </div>
                        <h2 className="text-base font-semibold text-white">Create Team Workspace</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {error && (
                    <div className="mx-6 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-gray-400">
                            Workspace Name <span className="text-red-400">*</span>
                        </label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Marketing Team"
                            maxLength={80}
                            required
                            autoFocus
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-gray-400">
                            Description <span className="text-gray-600">(optional)</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What is this workspace for?"
                            maxLength={200}
                            rows={2}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                        />
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !name.trim()}
                            className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
                        >
                            {loading ? "Creating…" : "Create Workspace"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
