"use client";
import { useState, useEffect, useRef } from "react";
import {
    X, Plus, Trash2, Upload, ChevronDown, ChevronRight, FileText, Loader2,
    AlertCircle, CheckCircle, BookOpen, RefreshCw, FolderOpen, Pause, Play,
    ExternalLink, HardDrive,
} from "lucide-react";
import type { KnowledgeBaseSummary, KnowledgeDocumentSummary, ConnectorSummary } from "@/types";

interface KnowledgePanelProps {
    onClose: () => void;
}

const FILE_ACCEPT = ".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls";
const POLL_INTERVAL = 3000;

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso?: string | null): string {
    if (!iso) return "never";
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
}

function StatusIcon({ status }: { status: string }) {
    if (status === "processing") return <Loader2 size={13} className="animate-spin text-yellow-400 shrink-0" />;
    if (status === "ready") return <CheckCircle size={13} className="text-green-400 shrink-0" />;
    return <AlertCircle size={13} className="text-red-400 shrink-0" />;
}

// ── Connector row ───────────────────────────────────────────────────────────────

function ConnectorRow({
    kbId,
    connector,
    onChanged,
}: {
    kbId: string;
    connector: ConnectorSummary;
    onChanged: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [folders, setFolders] = useState<{ id: string; name: string }[] | null>(null);
    const base = `/api/knowledge/${kbId}/connectors/${connector.id}`;

    const syncNow = async () => {
        setBusy(true);
        try {
            await fetch(`${base}/sync`, { method: "POST" });
            setTimeout(onChanged, 1500);
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!confirm("Remove this connector? Documents it synced will be deleted from the knowledge base.")) return;
        await fetch(base, { method: "DELETE" });
        onChanged();
    };

    const togglePause = async () => {
        await fetch(base, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: connector.status === "paused" ? "active" : "paused" }),
        });
        onChanged();
    };

    const openPicker = async () => {
        setPickerOpen((v) => !v);
        if (folders === null) {
            const res = await fetch(`${base}/folders`);
            setFolders(res.ok ? await res.json() : []);
        }
    };

    const chooseFolder = async (folderId: string | null, folderName: string) => {
        setPickerOpen(false);
        await fetch(base, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderId, folderName }),
        });
        onChanged();
        syncNow();
    };

    const folderName = connector.config?.folderName || "My Drive";

    return (
        <div className="px-4 py-2.5 bg-gray-900/40">
            <div className="flex items-center gap-2">
                <HardDrive size={14} className="text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-200 truncate flex items-center gap-1.5">
                        Google Drive
                        {connector.status === "paused" && <span className="text-[10px] text-gray-500">(paused)</span>}
                        {connector.status === "error" && <span className="text-[10px] text-red-500">(error)</span>}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                        {connector.accountEmail ? `${connector.accountEmail} · ` : ""}
                        {folderName} · synced {timeAgo(connector.lastSyncedAt)} · {connector._count.documents} docs
                    </p>
                    {connector.lastError && (
                        <p className="text-[10px] text-red-500 truncate" title={connector.lastError}>{connector.lastError}</p>
                    )}
                </div>
                <button onClick={openPicker} title="Choose folder" className="p-1 rounded text-gray-400 hover:text-blue-400 transition-colors shrink-0">
                    <FolderOpen size={13} />
                </button>
                <button onClick={togglePause} title={connector.status === "paused" ? "Resume" : "Pause"} className="p-1 rounded text-gray-400 hover:text-yellow-400 transition-colors shrink-0">
                    {connector.status === "paused" ? <Play size={13} /> : <Pause size={13} />}
                </button>
                <button onClick={syncNow} disabled={busy} title="Sync now" className="p-1 rounded text-gray-400 hover:text-green-400 transition-colors shrink-0 disabled:opacity-50">
                    <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
                </button>
                <button onClick={remove} title="Remove connector" className="p-1 rounded text-gray-400 hover:text-red-400 transition-colors shrink-0">
                    <Trash2 size={13} />
                </button>
            </div>

            {pickerOpen && (
                <div className="mt-2 ml-6 max-h-40 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 divide-y divide-gray-800">
                    <button onClick={() => chooseFolder(null, "My Drive")} className="w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-800">
                        Entire Drive
                    </button>
                    {folders === null ? (
                        <div className="px-3 py-2 text-[11px] text-gray-500 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Loading…</div>
                    ) : folders.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-gray-500">No folders found</div>
                    ) : (
                        folders.map((f) => (
                            <button key={f.id} onClick={() => chooseFolder(f.id, f.name)} className="w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-800 truncate">
                                {f.name}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

export function KnowledgePanel({ onClose }: KnowledgePanelProps) {
    const [bases, setBases] = useState<KnowledgeBaseSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [uploading, setUploading] = useState<string | null>(null); // kbId being uploaded to
    const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = async () => {
        try {
            const res = await fetch("/api/knowledge");
            if (!res.ok) return;
            const data = await res.json();
            setBases(data);
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    // Surface the result of an OAuth round-trip (?connected / ?connector_error)
    // and clean those params out of the URL.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const connected = params.get("connected");
        const err = params.get("connector_error");
        const kb = params.get("kb");
        if (connected) {
            setBanner({ kind: "ok", text: "Google Drive connected — initial sync started." });
            if (kb) setExpanded((prev) => new Set([...prev, kb]));
        } else if (err) {
            const msg = err === "no_refresh_token"
                ? "Google didn't return offline access. Remove app access in your Google account, then reconnect."
                : `Connection failed: ${err.replace(/_/g, " ")}`;
            setBanner({ kind: "err", text: msg });
        }
        if (connected || err) {
            params.delete("connected"); params.delete("connector_error"); params.delete("kb");
            const qs = params.toString();
            window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
        }
    }, []);

    // Poll while any document is processing OR any connector is mid-error-free
    // refresh that may still be producing docs.
    useEffect(() => {
        const hasProcessing = bases.some((kb) => kb.documents.some((d) => d.status === "processing"));
        if (hasProcessing && !pollRef.current) {
            pollRef.current = setInterval(load, POLL_INTERVAL);
        } else if (!hasProcessing && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
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
        setBases((prev) => [{ ...kb, documents: [], connectors: [] }, ...prev]);
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
                kb.id === kbId
                    ? { ...kb, documents: kb.documents.filter((d) => d.id !== docId) }
                    : kb
            )
        );
    };

    const connectDrive = (kbId: string) => {
        // Full-page navigation to the OAuth consent flow; returns to the app root.
        window.location.href = `/api/connectors/google/auth?knowledgeBaseId=${encodeURIComponent(kbId)}`;
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
            const res = await fetch(`/api/knowledge/${kbId}/documents`, {
                method: "POST",
                body: form,
            });
            if (!res.ok) {
                alert(`Upload failed: ${await res.text()}`);
                return;
            }
            const doc: KnowledgeDocumentSummary = await res.json();
            setBases((prev) =>
                prev.map((kb) =>
                    kb.id === kbId
                        ? { ...kb, documents: [{ ...doc, _count: { chunks: 0 } }, ...kb.documents] }
                        : kb
                )
            );
        } finally {
            setUploading(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <BookOpen size={18} className="text-blue-400" />
                        <h2 className="font-semibold text-white text-base">Knowledge Base</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {banner && (
                    <div className={`px-5 py-2.5 text-xs flex items-center justify-between gap-2 shrink-0 ${banner.kind === "ok" ? "bg-green-900/30 text-green-300" : "bg-red-900/30 text-red-300"}`}>
                        <span className="min-w-0">{banner.text}</span>
                        <button onClick={() => setBanner(null)} className="shrink-0 opacity-70 hover:opacity-100"><X size={13} /></button>
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-gray-500">
                            <Loader2 size={20} className="animate-spin" />
                        </div>
                    ) : bases.length === 0 && !creating ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                            <BookOpen size={32} className="text-gray-700" />
                            <p className="text-sm text-gray-500">No knowledge bases yet</p>
                            <p className="text-xs text-gray-600">Create one to upload documents or connect Google Drive for the AI to reference</p>
                        </div>
                    ) : (
                        bases.map((kb) => (
                            <div key={kb.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                                {/* KB header row */}
                                <div className="flex items-center gap-2 px-3 py-2.5">
                                    <button
                                        onClick={() => toggleExpand(kb.id)}
                                        className="flex-1 flex items-center gap-2 text-left min-w-0"
                                    >
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
                                        {uploading === kb.id
                                            ? <Loader2 size={13} className="animate-spin" />
                                            : <Upload size={13} />
                                        }
                                    </button>
                                    <button
                                        onClick={() => deleteKb(kb.id)}
                                        title="Delete knowledge base"
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-700 transition-colors"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>

                                {/* Expanded content: connectors + documents */}
                                {expanded.has(kb.id) && (
                                    <div className="border-t border-gray-700">
                                        {/* Connectors */}
                                        <div className="divide-y divide-gray-700/60">
                                            {(kb.connectors ?? []).map((c) => (
                                                <ConnectorRow key={c.id} kbId={kb.id} connector={c} onChanged={load} />
                                            ))}
                                        </div>
                                        <div className="px-4 py-2 border-b border-gray-700/60">
                                            <button
                                                onClick={() => connectDrive(kb.id)}
                                                className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-blue-400 transition-colors"
                                            >
                                                <Plus size={12} /> <HardDrive size={12} /> Connect Google Drive
                                            </button>
                                        </div>

                                        {/* Documents */}
                                        <div className="divide-y divide-gray-700/60">
                                            {kb.documents.length === 0 ? (
                                                <p className="text-xs text-gray-500 px-4 py-3">No documents yet — upload one or connect a source</p>
                                            ) : (
                                                kb.documents.map((doc) => (
                                                    <div key={doc.id} className="flex items-center gap-2 px-4 py-2.5">
                                                        <StatusIcon status={doc.status} />
                                                        {doc.source && doc.source !== "upload"
                                                            ? <HardDrive size={13} className="text-blue-400 shrink-0" />
                                                            : <FileText size={13} className="text-gray-500 shrink-0" />
                                                        }
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs text-gray-300 truncate flex items-center gap-1">
                                                                {doc.fileName}
                                                                {doc.externalUrl && (
                                                                    <a href={doc.externalUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-blue-400 shrink-0" title="Open source">
                                                                        <ExternalLink size={10} />
                                                                    </a>
                                                                )}
                                                            </p>
                                                            <p className="text-[10px] text-gray-600">
                                                                {doc.source && doc.source !== "upload" ? "Drive · " : formatBytes(doc.fileSize) + " · "}
                                                                {doc.status === "ready" && `${doc._count.chunks} chunks`}
                                                                {doc.status === "processing" && "processing…"}
                                                                {doc.status === "error" && (
                                                                    <span className="text-red-500">{doc.errorMessage}</span>
                                                                )}
                                                            </p>
                                                        </div>
                                                        {/* Connector-sourced docs are managed by the connector, not deleted individually. */}
                                                        {(!doc.source || doc.source === "upload") && (
                                                            <button
                                                                onClick={() => deleteDoc(kb.id, doc.id)}
                                                                title="Delete document"
                                                                className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors shrink-0"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}

                    {/* Inline create form */}
                    {creating && (
                        <div className="bg-gray-800 rounded-xl border border-blue-600 p-3 space-y-2">
                            <input
                                autoFocus
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") createKb(); if (e.key === "Escape") { setCreating(false); setNewName(""); setNewDesc(""); } }}
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

                {/* Footer */}
                <div className="px-4 py-3 border-t border-gray-800 shrink-0">
                    <button
                        onClick={() => setCreating(true)}
                        className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 rounded-xl transition-colors"
                    >
                        <Plus size={14} /> New Knowledge Base
                    </button>
                </div>

                <input ref={fileInputRef} type="file" accept={FILE_ACCEPT} className="hidden" onChange={handleFileChange} />
            </div>
        </div>
    );
}
