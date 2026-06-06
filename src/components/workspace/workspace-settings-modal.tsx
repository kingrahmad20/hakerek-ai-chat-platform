/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
    X, Loader2, Copy, Check, RefreshCw, Trash2, UserMinus,
    Shield, User, Crown, Plus, FolderPlus, Folder, Link, Palette,
    DollarSign, Zap, ShieldAlert,
} from "lucide-react";
import type { WorkspaceDetail, WorkspaceRole } from "@/types";
import { BarChart, LineChart } from "@/components/ui/charts";
import { fmtUsd, fmtTokens, shortModel } from "@/lib/pricing";

const COLOR_PRESETS = [
    { label: "Blue",   value: "#3b82f6" },
    { label: "Violet", value: "#8b5cf6" },
    { label: "Rose",   value: "#f43f5e" },
    { label: "Amber",  value: "#f59e0b" },
    { label: "Emerald",value: "#10b981" },
    { label: "Cyan",   value: "#06b6d4" },
    { label: "Slate",  value: "#64748b" },
];

interface Props {
    workspaceId: string;
    currentUserId: string;
    baseUrl: string;
    onClose: () => void;
    onDeleted: () => void;
    onUpdated: (patch: { id: string; name: string; description?: string | null; theme?: string | null; primaryColor?: string | null }) => void;
    onFolderCreated: (workspaceId: string, folder: { id: string; name: string; chats: [] }) => void;
    onFolderDeleted: (workspaceId: string, folderId: string) => void;
}

const ROLE_ICONS: Record<WorkspaceRole, React.ReactNode> = {
    OWNER: <Crown size={12} className="text-yellow-400" />,
    ADMIN: <Shield size={12} className="text-blue-400" />,
    MEMBER: <User size={12} className="text-gray-400" />,
};

function UserAvatar({ name, email, image }: { name?: string | null; email?: string | null; image?: string | null }) {
    if (image) return <img src={image} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />;
    const init = name ? name[0].toUpperCase() : (email?.[0] ?? "?").toUpperCase();
    return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {init}
        </div>
    );
}

export function WorkspaceSettingsModal({
    workspaceId,
    currentUserId,
    baseUrl,
    onClose,
    onDeleted,
    onUpdated,
    onFolderCreated,
    onFolderDeleted,
}: Props) {
    const [tab, setTab] = useState<"general" | "members" | "folders" | "usage">("general");
    const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/workspaces/${workspaceId}`);
            if (res.ok) setDetail(await res.json());
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => { load(); }, [load]);

    const canManage = detail?.myRole === "OWNER" || detail?.myRole === "ADMIN";
    const isOwner = detail?.myRole === "OWNER";

    return (
        <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] px-4"
            onClick={onClose}
        >
            <div
                className="bg-gray-900 rounded-2xl w-full max-w-xl shadow-2xl border border-gray-800 max-h-[88vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0 border-b border-gray-800">
                    <h2 className="font-semibold text-white">
                        {detail?.name ?? "Workspace Settings"}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-800 px-6 shrink-0">
                    {(canManage
                        ? (["general", "members", "folders", "usage"] as const)
                        : (["general", "members", "folders"] as const)
                    ).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`py-3 px-1 mr-6 text-sm border-b-2 capitalize transition-colors ${
                                tab === t
                                    ? "border-blue-500 text-white"
                                    : "border-transparent text-gray-500 hover:text-gray-300"
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 size={20} className="animate-spin text-gray-500" />
                        </div>
                    ) : !detail ? (
                        <p className="text-center text-gray-500 py-10">Failed to load workspace.</p>
                    ) : tab === "general" ? (
                        <GeneralTab
                            detail={detail}
                            canManage={canManage}
                            isOwner={isOwner}
                            currentUserId={currentUserId}
                            baseUrl={baseUrl}
                            onUpdated={(patch) => {
                                setDetail((d) => d ? { ...d, ...patch } : d);
                                onUpdated({ id: workspaceId, ...patch });
                            }}
                            onDeleted={onDeleted}
                            onInviteRefreshed={(token) => setDetail((d) => d ? { ...d, inviteToken: token } : d)}
                            onBrandingUpdated={(branding) => {
                                setDetail((d) => d ? { ...d, ...branding } : d);
                                onUpdated({ id: workspaceId, name: detail.name, ...branding });
                            }}
                        />
                    ) : tab === "members" ? (
                        <MembersTab
                            detail={detail}
                            currentUserId={currentUserId}
                            canManage={canManage}
                            isOwner={isOwner}
                            onRefresh={load}
                        />
                    ) : tab === "folders" ? (
                        <FoldersTab
                            detail={detail}
                            canManage={canManage}
                            workspaceId={workspaceId}
                            onFolderCreated={(folder) => {
                                setDetail((d) => d ? { ...d, folders: [...d.folders, { ...folder, chats: [] }] } : d);
                                onFolderCreated(workspaceId, { ...folder, chats: [] });
                            }}
                            onFolderDeleted={(folderId) => {
                                setDetail((d) => d ? { ...d, folders: d.folders.filter((f) => f.id !== folderId) } : d);
                                onFolderDeleted(workspaceId, folderId);
                            }}
                        />
                    ) : (
                        <UsageTab workspaceId={workspaceId} />
                    )}
                </div>
            </div>
        </div>
    );
}

// ── General Tab ───────────────────────────────────────────────────────────────

function GeneralTab({
    detail, canManage, isOwner, currentUserId: _currentUserId, baseUrl, onUpdated, onDeleted, onInviteRefreshed, onBrandingUpdated,
}: {
    detail: WorkspaceDetail;
    canManage: boolean;
    isOwner: boolean;
    currentUserId: string;
    baseUrl: string;
    onUpdated: (patch: { name: string; description?: string | null }) => void;
    onDeleted: () => void;
    onInviteRefreshed: (token: string) => void;
    onBrandingUpdated: (branding: { theme?: string | null; primaryColor?: string | null }) => void;
}) {
    const [name, setName] = useState(detail.name);
    const [description, setDescription] = useState(detail.description ?? "");
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState("");
    const [copied, setCopied] = useState(false);
    const [generatingLink, setGeneratingLink] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const inviteUrl = detail.inviteToken ? `${baseUrl}/workspace/invite/${detail.inviteToken}` : null;

    const handleSave = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/workspaces/${detail.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
            });
            if (res.ok) {
                onUpdated({ name: name.trim(), description: description.trim() || null });
                setSaveMsg("Saved!");
            } else {
                setSaveMsg("Failed to save.");
            }
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMsg(""), 3000);
        }
    };

    const generateLink = async () => {
        setGeneratingLink(true);
        try {
            const res = await fetch(`/api/workspaces/${detail.id}/invite`, { method: "POST" });
            if (res.ok) {
                const data = await res.json();
                onInviteRefreshed(data.token);
            }
        } finally {
            setGeneratingLink(false);
        }
    };

    const copyLink = () => {
        if (!inviteUrl) return;
        navigator.clipboard.writeText(inviteUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleDelete = async () => {
        if (!confirmDelete) { setConfirmDelete(true); return; }
        setDeleting(true);
        try {
            const res = await fetch(`/api/workspaces/${detail.id}`, { method: "DELETE" });
            if (res.ok) onDeleted();
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            {canManage && (
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-400">Workspace Name</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={80}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-400">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={200}
                            rows={2}
                            placeholder="Describe your workspace…"
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSave}
                            disabled={saving || !name.trim()}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm rounded-xl transition-colors"
                        >
                            {saving ? "Saving…" : "Save Changes"}
                        </button>
                        {saveMsg && <span className="text-sm text-gray-400">{saveMsg}</span>}
                    </div>
                </div>
            )}

            {/* Invite Link */}
            {canManage && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Link size={14} className="text-gray-400" />
                        <h3 className="text-sm font-medium text-gray-300">Invite Link</h3>
                    </div>
                    {inviteUrl ? (
                        <div className="flex gap-2">
                            <input
                                readOnly
                                value={inviteUrl}
                                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-300 focus:outline-none select-all"
                            />
                            <button
                                onClick={copyLink}
                                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-gray-400 hover:text-white transition-colors"
                                title="Copy link"
                            >
                                {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
                            </button>
                            <button
                                onClick={generateLink}
                                disabled={generatingLink}
                                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-gray-400 hover:text-white transition-colors"
                                title="Generate new link (revokes previous)"
                            >
                                <RefreshCw size={15} className={generatingLink ? "animate-spin" : ""} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={generateLink}
                            disabled={generatingLink}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-sm text-gray-300 transition-colors"
                        >
                            {generatingLink ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            Generate Invite Link
                        </button>
                    )}
                    <p className="text-xs text-gray-600">
                        Anyone with this link can join as a member. Generating a new link revokes the previous one.
                    </p>
                </div>
            )}

            {/* Branding */}
            {canManage && (
                <BrandingSection
                    workspaceId={detail.id}
                    initialTheme={(detail.theme as "dark" | "light" | null) ?? null}
                    initialColor={detail.primaryColor ?? null}
                    onSaved={onBrandingUpdated}
                />
            )}

            {/* Danger Zone */}
            {isOwner && (
                <div className="border border-red-500/20 rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-medium text-red-400">Danger Zone</h3>
                    <p className="text-xs text-gray-500">
                        Deleting this workspace is permanent. All folders and shared chats will be unlinked.
                    </p>
                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 text-sm rounded-xl transition-colors disabled:opacity-50"
                    >
                        <Trash2 size={14} />
                        {confirmDelete ? (deleting ? "Deleting…" : "Click again to confirm") : "Delete Workspace"}
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Members Tab ───────────────────────────────────────────────────────────────

function MembersTab({
    detail, currentUserId, canManage, isOwner, onRefresh,
}: {
    detail: WorkspaceDetail;
    currentUserId: string;
    canManage: boolean;
    isOwner: boolean;
    onRefresh: () => void;
}) {
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

    const removeMember = async (userId: string) => {
        setRemovingId(userId);
        try {
            await fetch(`/api/workspaces/${detail.id}/members/${userId}`, { method: "DELETE" });
            onRefresh();
        } finally {
            setRemovingId(null);
        }
    };

    const changeRole = async (userId: string, role: "ADMIN" | "MEMBER") => {
        setChangingRoleId(userId);
        try {
            await fetch(`/api/workspaces/${detail.id}/members/${userId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role }),
            });
            onRefresh();
        } finally {
            setChangingRoleId(null);
        }
    };

    return (
        <div className="space-y-2">
            <p className="text-xs text-gray-500 mb-4">{detail.memberCount} members</p>
            {detail.members.map((m) => {
                const isSelf = m.userId === currentUserId;
                const isTargetOwner = m.role === "OWNER";
                return (
                    <div key={m.userId} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-800/50 transition-colors">
                        <UserAvatar name={m.name} email={m.email} image={m.image} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm text-white truncate">{m.name || m.email}</span>
                                {isSelf && <span className="text-xs text-gray-600">(you)</span>}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                                {ROLE_ICONS[m.role as WorkspaceRole]}
                                <span className="text-xs text-gray-500">{m.role}</span>
                            </div>
                        </div>

                        {/* Role change (owner only, on non-owners) */}
                        {isOwner && !isSelf && !isTargetOwner && (
                            <select
                                value={m.role}
                                onChange={(e) => changeRole(m.userId, e.target.value as "ADMIN" | "MEMBER")}
                                disabled={changingRoleId === m.userId}
                                className="text-xs bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-gray-300 focus:outline-none"
                            >
                                <option value="ADMIN">Admin</option>
                                <option value="MEMBER">Member</option>
                            </select>
                        )}

                        {/* Remove button */}
                        {(isSelf || (canManage && !isTargetOwner && !isSelf)) && (
                            <button
                                onClick={() => removeMember(m.userId)}
                                disabled={removingId === m.userId}
                                className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                title={isSelf ? "Leave workspace" : "Remove member"}
                            >
                                {removingId === m.userId
                                    ? <Loader2 size={14} className="animate-spin" />
                                    : isSelf
                                        ? <UserMinus size={14} />
                                        : <X size={14} />
                                }
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Branding Section ──────────────────────────────────────────────────────────

function BrandingSection({
    workspaceId,
    initialTheme,
    initialColor,
    onSaved,
}: {
    workspaceId: string;
    initialTheme: "dark" | "light" | null;
    initialColor: string | null;
    onSaved: (branding: { theme?: string | null; primaryColor?: string | null }) => void;
}) {
    const [theme, setTheme] = useState<"dark" | "light" | null>(initialTheme);
    const [color, setColor] = useState<string | null>(initialColor);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState("");

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/workspaces/${workspaceId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ theme, primaryColor: color }),
            });
            if (res.ok) {
                const data = await res.json();
                onSaved({ theme: data.theme, primaryColor: data.primaryColor });
                setSaveMsg("Saved!");
            } else {
                setSaveMsg("Failed to save.");
            }
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMsg(""), 3000);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Palette size={14} className="text-gray-400" />
                <h3 className="text-sm font-medium text-gray-300">Branding</h3>
            </div>

            {/* Theme */}
            <div className="space-y-2">
                <label className="text-xs font-medium text-gray-400">Workspace Theme</label>
                <div className="flex gap-2">
                    {([null, "dark", "light"] as const).map((t) => (
                        <button
                            key={String(t)}
                            onClick={() => setTheme(t)}
                            className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
                                theme === t
                                    ? "border-blue-500 bg-blue-500/10 text-blue-400"
                                    : "border-gray-700 bg-gray-800 text-gray-400 hover:text-gray-300 hover:border-gray-600"
                            }`}
                        >
                            {t === null ? "Member's preference" : t === "dark" ? "Dark" : "Light"}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-gray-600">
                    Overrides each member&apos;s personal theme when they view this workspace.
                </p>
            </div>

            {/* Primary color */}
            <div className="space-y-2">
                <label className="text-xs font-medium text-gray-400">Accent Color</label>
                <div className="flex flex-wrap gap-2">
                    {COLOR_PRESETS.map((preset) => (
                        <button
                            key={preset.value}
                            onClick={() => setColor(preset.value)}
                            title={preset.label}
                            className={`w-7 h-7 rounded-full border-2 transition-transform ${
                                color === preset.value ? "border-white scale-110" : "border-transparent hover:scale-105"
                            }`}
                            style={{ backgroundColor: preset.value }}
                        />
                    ))}
                    <button
                        onClick={() => setColor(null)}
                        className={`w-7 h-7 rounded-full border-2 text-gray-500 text-xs flex items-center justify-center bg-gray-800 transition-transform ${
                            color === null ? "border-white scale-110" : "border-transparent hover:scale-105"
                        }`}
                        title="Default"
                    >
                        —
                    </button>
                </div>
                <p className="text-xs text-gray-600">
                    Applied as the accent color in workspace UI. No color = default blue.
                </p>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm rounded-xl transition-colors ws-primary-bg"
                >
                    {saving ? "Saving…" : "Save Branding"}
                </button>
                {saveMsg && <span className="text-sm text-gray-400">{saveMsg}</span>}
            </div>
        </div>
    );
}

// ── Folders Tab ───────────────────────────────────────────────────────────────

function FoldersTab({
    detail, canManage, workspaceId, onFolderCreated, onFolderDeleted,
}: {
    detail: WorkspaceDetail;
    canManage: boolean;
    workspaceId: string;
    onFolderCreated: (folder: { id: string; name: string }) => void;
    onFolderDeleted: (folderId: string) => void;
}) {
    const [newFolderName, setNewFolderName] = useState("");
    const [creating, setCreating] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState("");

    const createFolder = async () => {
        const name = newFolderName.trim();
        if (!name) return;
        setCreating(true);
        setError("");
        try {
            const res = await fetch(`/api/workspaces/${workspaceId}/folders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            if (!res.ok) {
                setError((await res.text()) || "Failed to create folder");
                return;
            }
            const data = await res.json();
            onFolderCreated(data);
            setNewFolderName("");
        } finally {
            setCreating(false);
        }
    };

    const deleteFolder = async (folderId: string) => {
        setDeletingId(folderId);
        try {
            const res = await fetch(`/api/workspaces/${workspaceId}/folders/${folderId}`, { method: "DELETE" });
            if (res.ok) onFolderDeleted(folderId);
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="space-y-4">
            {canManage && (
                <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-400">New Shared Folder</label>
                    <div className="flex gap-2">
                        <input
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="Folder name…"
                            maxLength={80}
                            onKeyDown={(e) => { if (e.key === "Enter") createFolder(); }}
                            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                        <button
                            onClick={createFolder}
                            disabled={creating || !newFolderName.trim()}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm rounded-xl transition-colors flex items-center gap-1.5"
                        >
                            {creating ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
                            Create
                        </button>
                    </div>
                    {error && <p className="text-xs text-red-400">{error}</p>}
                </div>
            )}

            <div className="space-y-1">
                {detail.folders.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center">No shared folders yet.</p>
                ) : (
                    detail.folders.map((f) => (
                        <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-800/50 transition-colors">
                            <Folder size={16} className="text-blue-400 shrink-0" />
                            <span className="flex-1 text-sm text-white">{f.name}</span>
                            <span className="text-xs text-gray-500">{(f as any)._count?.chats ?? 0} chats</span>
                            {canManage && (
                                <button
                                    onClick={() => deleteFolder(f.id)}
                                    disabled={deletingId === f.id}
                                    className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                    title="Delete folder"
                                >
                                    {deletingId === f.id
                                        ? <Loader2 size={13} className="animate-spin" />
                                        : <Trash2 size={13} />
                                    }
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ── Usage Tab ─────────────────────────────────────────────────────────────────

const USAGE_RANGES = [7, 30, 90];

interface WorkspaceUsage {
    range: number;
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalEstimatedCostUsd: number;
    byModel: {
        model: string;
        requests: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
    }[];
    byMember: {
        userId: string | null;
        name: string;
        requests: number;
        totalTokens: number;
        estimatedCostUsd: number;
    }[];
    dailyStats: { date: string; tokens: number; cost: number; requests: number }[];
    monthlyBudgetUsd: number | null;
    currentMonthSpendUsd: number;
}

function UsageTab({ workspaceId }: { workspaceId: string }) {
    const [usage, setUsage] = useState<WorkspaceUsage | null>(null);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState(30);

    const reload = useCallback(() => {
        setLoading(true);
        fetch(`/api/workspaces/${workspaceId}/usage?range=${range}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => setUsage(d))
            .catch(() => setUsage(null))
            .finally(() => setLoading(false));
    }, [workspaceId, range]);

    useEffect(() => { reload(); }, [reload]);

    const models = (usage?.byModel ?? []).slice(0, 8).map((m) => ({ ...m, label: shortModel(m.model) }));
    const members = (usage?.byMember ?? []).slice(0, 10);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Zap size={14} className="text-orange-400" /> Token Usage &amp; Cost
                </h3>
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
                <div className="flex justify-center py-10">
                    <Loader2 size={20} className="animate-spin text-gray-500" />
                </div>
            ) : !usage ? (
                <p className="text-sm text-gray-500 py-4 text-center">Failed to load usage.</p>
            ) : (
                <div className="space-y-4">
                    {/* Budget guardrail */}
                    <BudgetCard
                        workspaceId={workspaceId}
                        monthlyBudgetUsd={usage.monthlyBudgetUsd}
                        currentMonthSpendUsd={usage.currentMonthSpendUsd}
                        onSaved={reload}
                    />

                    {/* Summary cards */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gray-800 rounded-xl p-4 text-center">
                            <p className="text-xl font-bold text-white">{fmtTokens(usage.totalTokens)}</p>
                            <p className="text-xs text-gray-500 mt-0.5">Total Tokens</p>
                        </div>
                        <div className="bg-gray-800 rounded-xl p-4 text-center">
                            <p className="text-xl font-bold text-white">{usage.totalRequests.toLocaleString()}</p>
                            <p className="text-xs text-gray-500 mt-0.5">Requests</p>
                        </div>
                        <div className="bg-gray-800 rounded-xl p-4 text-center">
                            <p className="text-xl font-bold text-yellow-400 flex items-center justify-center gap-1">
                                <DollarSign size={15} />
                                {fmtUsd(usage.totalEstimatedCostUsd).replace("$", "")}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">Est. Cost</p>
                        </div>
                    </div>

                    {/* Daily cost trend */}
                    <div className="bg-gray-800 rounded-xl p-4">
                        <p className="text-xs text-gray-500 mb-3">Daily Cost</p>
                        <LineChart data={usage.dailyStats} valueKey="cost" stroke="#eab308" formatVal={fmtUsd} />
                    </div>

                    {/* Usage by member */}
                    {members.length > 0 && (
                        <div className="bg-gray-800 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-3">Usage by Member</p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[360px]">
                                    <thead>
                                        <tr className="text-left text-xs text-gray-500 border-b border-gray-700">
                                            <th className="pb-2 font-medium">Member</th>
                                            <th className="pb-2 font-medium text-right">Requests</th>
                                            <th className="pb-2 font-medium text-right">Tokens</th>
                                            <th className="pb-2 font-medium text-right">Est. Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {members.map((m) => (
                                            <tr key={m.userId ?? m.name} className="border-b border-gray-700/40">
                                                <td className="py-2 text-gray-300 truncate max-w-[140px]">{m.name}</td>
                                                <td className="py-2 text-right text-gray-400">{m.requests.toLocaleString()}</td>
                                                <td className="py-2 text-right text-gray-400">{fmtTokens(m.totalTokens)}</td>
                                                <td className="py-2 text-right text-yellow-400">{fmtUsd(m.estimatedCostUsd)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Tokens & cost by model */}
                    {models.length > 0 && (
                        <div className="bg-gray-800 rounded-xl p-4 space-y-5">
                            <div>
                                <p className="text-xs text-gray-500 mb-3">Tokens by Model</p>
                                <BarChart data={models} valueKey="totalTokens" labelKey="label" color="bg-blue-500" formatVal={fmtTokens} />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-3">Cost by Model</p>
                                <BarChart data={models} valueKey="estimatedCostUsd" labelKey="label" color="bg-yellow-500" formatVal={fmtUsd} />
                            </div>
                        </div>
                    )}

                    {usage.totalTokens === 0 && (
                        <p className="text-sm text-gray-500 py-4 text-center">No usage recorded for this workspace yet.</p>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Budget Guardrail Card ─────────────────────────────────────────────────────
// Shows month-to-date spend against the workspace cap and lets an OWNER/ADMIN
// set or clear it. At 80% members are notified; at 100% new AI requests stop.

function BudgetCard({
    workspaceId, monthlyBudgetUsd, currentMonthSpendUsd, onSaved,
}: {
    workspaceId: string;
    monthlyBudgetUsd: number | null;
    currentMonthSpendUsd: number;
    onSaved: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(monthlyBudgetUsd != null ? String(monthlyBudgetUsd) : "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const save = async (budget: number | null) => {
        setSaving(true);
        setError("");
        try {
            const res = await fetch(`/api/workspaces/${workspaceId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ monthlyBudgetUsd: budget }),
            });
            if (!res.ok) {
                setError((await res.json().catch(() => ({})))?.error || "Failed to save budget");
                return;
            }
            setEditing(false);
            onSaved();
        } finally {
            setSaving(false);
        }
    };

    const handleSave = () => {
        const trimmed = value.trim();
        if (trimmed === "") { save(null); return; }
        const num = Number(trimmed);
        if (!Number.isFinite(num) || num < 0) { setError("Enter a valid amount"); return; }
        save(num);
    };

    const pct = monthlyBudgetUsd && monthlyBudgetUsd > 0
        ? Math.min(100, (currentMonthSpendUsd / monthlyBudgetUsd) * 100)
        : 0;
    const over = monthlyBudgetUsd != null && currentMonthSpendUsd >= monthlyBudgetUsd;
    const warn = monthlyBudgetUsd != null && pct >= 80 && !over;
    const barColor = over ? "bg-red-500" : warn ? "bg-amber-500" : "bg-emerald-500";

    return (
        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <ShieldAlert size={14} className={over ? "text-red-400" : warn ? "text-amber-400" : "text-emerald-400"} />
                    Monthly Budget
                </h3>
                {!editing && (
                    <button
                        onClick={() => { setValue(monthlyBudgetUsd != null ? String(monthlyBudgetUsd) : ""); setEditing(true); }}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        {monthlyBudgetUsd != null ? "Edit cap" : "Set cap"}
                    </button>
                )}
            </div>

            {editing ? (
                <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                            <DollarSign size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder="No cap"
                                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm rounded-lg transition-colors"
                        >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : "Save"}
                        </button>
                        <button
                            onClick={() => { setEditing(false); setError(""); }}
                            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg transition-colors text-gray-300"
                        >
                            Cancel
                        </button>
                    </div>
                    {error && <p className="text-xs text-red-400">{error}</p>}
                    <p className="text-xs text-gray-600">
                        Leave blank for no cap. Members are alerted at 80%; new AI requests are paused at 100% until next month.
                    </p>
                </div>
            ) : monthlyBudgetUsd == null ? (
                <p className="text-xs text-gray-500">
                    No spending cap set. {fmtUsd(currentMonthSpendUsd)} spent this month.
                </p>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                        <span className={`text-sm font-medium ${over ? "text-red-400" : warn ? "text-amber-400" : "text-white"}`}>
                            {fmtUsd(currentMonthSpendUsd)}
                            <span className="text-gray-500 font-normal"> / {fmtUsd(monthlyBudgetUsd)}</span>
                        </span>
                        <span className={`text-xs font-medium ${over ? "text-red-400" : warn ? "text-amber-400" : "text-gray-400"}`}>
                            {Math.round((currentMonthSpendUsd / monthlyBudgetUsd) * 100)}%
                        </span>
                    </div>
                    <div className="h-2 w-full bg-gray-900 rounded-full overflow-hidden">
                        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    {over ? (
                        <p className="text-xs text-red-400">
                            Budget reached — new AI requests in this workspace are paused until next month or until the cap is raised.
                        </p>
                    ) : warn ? (
                        <p className="text-xs text-amber-400">Approaching the monthly cap.</p>
                    ) : (
                        <p className="text-xs text-gray-600">Resets at the start of each calendar month.</p>
                    )}
                </div>
            )}
        </div>
    );
}
