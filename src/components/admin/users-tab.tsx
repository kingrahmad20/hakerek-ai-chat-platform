"use client";

import { useState, useTransition, useEffect } from "react";
import { ShieldBan, ShieldCheck, Trash2, X, ChevronDown, ChevronUp, Megaphone, Bell } from "lucide-react";
import { banUser, unbanUser, deleteUser, assignPlatformRole, bulkDeleteUsers, bulkBanUsers, bulkUnbanUsers, setUserQuota, sendNotificationToUser, broadcastNotification } from "@/app/admin/actions";
import type { PlatformRole } from "@/types";

interface UserItem {
    id: string;
    name?: string | null;
    email: string | null;
    role: string;
    banned: boolean;
    monthlyMessageQuota: number | null;
    monthlyTokenQuota: number | null;
    monthlyMsgUsed: number;
    monthlyTokensUsed: number;
    _count: { chats: number };
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
    ADMIN:             { label: "Admin",             color: "bg-purple-500/20 text-purple-400" },
    user_manager:      { label: "User Manager",      color: "bg-blue-500/20 text-blue-400" },
    content_moderator: { label: "Content Moderator", color: "bg-teal-500/20 text-teal-400" },
    billing_admin:     { label: "Billing Admin",     color: "bg-amber-500/20 text-amber-400" },
    USER:              { label: "User",               color: "bg-gray-700 text-gray-400" },
};

function RoleBadge({ role, banned }: { role: string; banned: boolean }) {
    if (banned) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Banned</span>;
    const info = ROLE_LABELS[role] ?? { label: role, color: "bg-gray-700 text-gray-400" };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}>{info.label}</span>;
}

function fmtTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}

function QuotaCell({ user }: { user: UserItem }) {
    const msgLimit = user.monthlyMessageQuota;
    const tokLimit = user.monthlyTokenQuota;

    if (msgLimit == null && tokLimit == null) {
        return <span className="text-gray-600 text-xs">—</span>;
    }

    return (
        <div className="flex flex-col gap-0.5 text-xs">
            {msgLimit != null && (
                <span className={user.monthlyMsgUsed >= msgLimit ? "text-red-400 font-medium" : "text-gray-300"}>
                    {user.monthlyMsgUsed}/{msgLimit} msgs
                </span>
            )}
            {tokLimit != null && (
                <span className={user.monthlyTokensUsed >= tokLimit ? "text-red-400 font-medium" : "text-gray-400"}>
                    {fmtTokens(user.monthlyTokensUsed)}/{fmtTokens(tokLimit)} tok
                </span>
            )}
        </div>
    );
}

function QuotaForm({ user, onClose }: { user: UserItem; onClose: () => void }) {
    const [isPending, startTransition] = useTransition();

    return (
        <tr className="bg-gray-900/60 border-b border-gray-800">
            <td colSpan={8} className="px-6 py-4">
                <form
                    action={(fd) => startTransition(async () => { await setUserQuota(fd); onClose(); })}
                    className="flex flex-wrap items-end gap-4"
                >
                    <input type="hidden" name="userId" value={user.id} />

                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400">Monthly message limit</label>
                        <div className="flex items-center gap-1.5">
                            <input
                                type="number"
                                name="monthlyMessageQuota"
                                defaultValue={user.monthlyMessageQuota ?? ""}
                                min="1"
                                placeholder="unlimited"
                                className="w-32 text-xs bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 placeholder-gray-600"
                            />
                            <span className="text-xs text-gray-500">msgs/mo</span>
                        </div>
                        <p className="text-xs text-gray-600">Used this month: {user.monthlyMsgUsed}</p>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400">Monthly token limit</label>
                        <div className="flex items-center gap-1.5">
                            <input
                                type="number"
                                name="monthlyTokenQuota"
                                defaultValue={user.monthlyTokenQuota ?? ""}
                                min="1"
                                placeholder="unlimited"
                                className="w-36 text-xs bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 placeholder-gray-600"
                            />
                            <span className="text-xs text-gray-500">tok/mo</span>
                        </div>
                        <p className="text-xs text-gray-600">Used this month: {fmtTokens(user.monthlyTokensUsed)}</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="submit"
                            disabled={isPending}
                            className="px-3 py-1.5 text-xs rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                        >
                            {isPending ? "Saving…" : "Save"}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs rounded-lg font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <p className="text-xs text-gray-500 ml-1">Leave blank to remove the limit.</p>
                    </div>
                </form>
            </td>
        </tr>
    );
}

function NotifyForm({ user, onClose }: { user: UserItem; onClose: () => void }) {
    const [isPending, startTransition] = useTransition();

    return (
        <tr className="bg-gray-900/60 border-b border-gray-800">
            <td colSpan={8} className="px-6 py-4">
                <form
                    action={(fd) => startTransition(async () => { await sendNotificationToUser(fd); onClose(); })}
                    className="flex flex-wrap items-end gap-4"
                >
                    <input type="hidden" name="userId" value={user.id} />

                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400">Title <span className="text-red-400">*</span></label>
                        <input
                            required
                            type="text"
                            name="title"
                            maxLength={200}
                            placeholder="Notification title"
                            className="w-56 text-xs bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 placeholder-gray-600"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400">Body</label>
                        <input
                            type="text"
                            name="body"
                            maxLength={500}
                            placeholder="Optional message"
                            className="w-72 text-xs bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 placeholder-gray-600"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400">Link</label>
                        <input
                            type="text"
                            name="link"
                            maxLength={500}
                            placeholder="Optional URL"
                            className="w-48 text-xs bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 placeholder-gray-600"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="submit"
                            disabled={isPending}
                            className="px-3 py-1.5 text-xs rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                        >
                            {isPending ? "Sending…" : "Send"}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs rounded-lg font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </td>
        </tr>
    );
}

function BroadcastForm() {
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    if (!open) {
        return (
            <div className="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between">
                <span className="text-xs text-gray-500">Send a notification to all users at once</span>
                <button
                    onClick={() => { setOpen(true); setResult(null); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors"
                >
                    <Megaphone size={13} /> Broadcast
                </button>
            </div>
        );
    }

    return (
        <div className="px-6 py-4 border-b border-gray-800 bg-orange-500/5">
            <div className="flex items-center gap-2 mb-3">
                <Megaphone size={14} className="text-orange-400" />
                <span className="text-sm font-medium text-orange-300">Broadcast to all users</span>
                <button onClick={() => setOpen(false)} className="ml-auto text-gray-500 hover:text-white transition-colors">
                    <X size={14} />
                </button>
            </div>
            <form
                action={(fd: FormData) => {
                    startTransition(async () => {
                        const res = await broadcastNotification(null, fd);
                        setResult(res);
                        if (res?.ok) setOpen(false);
                    });
                }}
                className="flex flex-wrap items-end gap-4"
            >
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">Title <span className="text-red-400">*</span></label>
                    <input
                        required
                        type="text"
                        name="title"
                        maxLength={200}
                        placeholder="Notification title"
                        className="w-56 text-xs bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500 placeholder-gray-600"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">Body</label>
                    <input
                        type="text"
                        name="body"
                        maxLength={500}
                        placeholder="Optional message"
                        className="w-72 text-xs bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500 placeholder-gray-600"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">Link</label>
                    <input
                        type="text"
                        name="link"
                        maxLength={500}
                        placeholder="Optional URL"
                        className="w-48 text-xs bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500 placeholder-gray-600"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="submit"
                        disabled={isPending}
                        className="px-3 py-1.5 text-xs rounded-lg font-medium bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-50 transition-colors"
                    >
                        {isPending ? "Sending…" : "Send to All"}
                    </button>
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="px-3 py-1.5 text-xs rounded-lg font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </form>
            {result && !result.ok && (
                <p className="mt-2 text-xs text-red-400">{result.message}</p>
            )}
        </div>
    );
}

export function UsersTab({
    users,
    currentUserId,
    currentUserRole,
}: {
    users: UserItem[];
    currentUserId: string;
    currentUserRole: PlatformRole;
}) {
    const isFullAdmin = currentUserRole === "ADMIN";
    const isBillingAdmin = currentUserRole === "ADMIN" || currentUserRole === "billing_admin";
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [quotaOpen, setQuotaOpen] = useState<Set<string>>(new Set());
    const [notifyOpen, setNotifyOpen] = useState<Set<string>>(new Set());
    const [isPending, startTransition] = useTransition();
    const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        const fetchOnline = () =>
            fetch("/api/admin/online-users")
                .then((r) => r.json())
                .then((d) => setOnlineIds(new Set(d.onlineIds ?? [])))
                .catch(() => {});
        fetchOnline();
        const id = setInterval(fetchOnline, 30_000);
        return () => clearInterval(id);
    }, []);

    const selectableIds = users.filter((u) => u.id !== currentUserId).map((u) => u.id);
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

    const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds));

    const toggleOne = (id: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const toggleQuota = (id: string) =>
        setQuotaOpen((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const toggleNotify = (id: string) =>
        setNotifyOpen((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const doBulk = (action: (fd: FormData) => Promise<unknown>) => {
        const fd = new FormData();
        selected.forEach((id) => fd.append("userId", id));
        startTransition(async () => {
            await action(fd);
            setSelected(new Set());
        });
    };

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-800">
                <h2 className="font-semibold">All Users ({users.length})</h2>
            </div>

            <BroadcastForm />

            {selected.size > 0 && (
                <div className="px-4 py-2.5 bg-blue-600/10 border-b border-blue-500/20 flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-blue-400 font-medium">{selected.size} selected</span>
                    <div className="flex items-center gap-2 ml-auto flex-wrap">
                        <button
                            onClick={() => doBulk(bulkBanUsers)}
                            disabled={isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 disabled:opacity-50 transition-colors"
                        >
                            <ShieldBan size={13} /> Ban Selected
                        </button>
                        <button
                            onClick={() => doBulk(bulkUnbanUsers)}
                            disabled={isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-50 transition-colors"
                        >
                            <ShieldCheck size={13} /> Unban Selected
                        </button>
                        <button
                            onClick={() => doBulk(bulkDeleteUsers)}
                            disabled={isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                        >
                            <Trash2 size={13} /> Delete Selected
                        </button>
                        <button
                            onClick={() => setSelected(new Set())}
                            className="p-1.5 text-gray-500 hover:text-white transition-colors"
                            aria-label="Clear selection"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-800 text-left text-gray-400 text-xs uppercase tracking-wider">
                            <th className="p-4 w-10">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={toggleAll}
                                    disabled={selectableIds.length === 0}
                                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-blue-500 cursor-pointer disabled:cursor-not-allowed"
                                />
                            </th>
                            <th className="p-4 font-medium">Name</th>
                            <th className="p-4 font-medium">Email</th>
                            <th className="p-4 font-medium">Role</th>
                            <th className="p-4 font-medium">Chats</th>
                            <th className="p-4 font-medium">Quota (this mo.)</th>
                            <th className="p-4 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {users.map((user) => {
                            const isCurrentUser = user.id === currentUserId;
                            const isChecked = selected.has(user.id);
                            const quotaExpanded = quotaOpen.has(user.id);
                            const notifyExpanded = notifyOpen.has(user.id);
                            return (
                                <>
                                    <tr
                                        key={user.id}
                                        className={`transition-colors ${
                                            user.banned
                                                ? "opacity-50 bg-red-950/10"
                                                : isChecked
                                                ? "bg-blue-900/10"
                                                : "hover:bg-gray-800/40"
                                        }`}
                                    >
                                        <td className="p-4">
                                            {!isCurrentUser && (
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => toggleOne(user.id)}
                                                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-blue-500 cursor-pointer"
                                                />
                                            )}
                                        </td>
                                        <td className="p-4 font-medium">
                                            <div className="flex items-center gap-2">
                                                <span
                                                    title={onlineIds.has(user.id) ? "Online" : "Offline"}
                                                    className={`w-2 h-2 rounded-full shrink-0 ${onlineIds.has(user.id) ? "bg-green-400" : "bg-gray-600"}`}
                                                />
                                                {user.name || "—"}
                                            </div>
                                        </td>
                                        <td className="p-4 text-gray-400">{user.email}</td>
                                        <td className="p-4">
                                            <RoleBadge role={user.role} banned={user.banned} />
                                        </td>
                                        <td className="p-4 text-gray-400">{user._count.chats}</td>
                                        <td className="p-4">
                                            <QuotaCell user={user} />
                                        </td>
                                        <td className="p-4">
                                            {isCurrentUser ? (
                                                <span className="text-xs text-gray-600 italic">You</span>
                                            ) : (
                                                <div className="flex gap-1 flex-wrap items-center">
                                                    <form action={user.banned ? unbanUser : banUser}>
                                                        <input type="hidden" name="userId" value={user.id} />
                                                        <button
                                                            type="submit"
                                                            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                                                                user.banned
                                                                    ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                                                                    : "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
                                                            }`}
                                                        >
                                                            {user.banned ? "Unban" : "Ban"}
                                                        </button>
                                                    </form>

                                                    {isFullAdmin && !user.banned && (
                                                        <form action={assignPlatformRole} className="flex items-center gap-1">
                                                            <input type="hidden" name="userId" value={user.id} />
                                                            <select
                                                                name="role"
                                                                defaultValue={user.role}
                                                                className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500"
                                                            >
                                                                <option value="USER">User</option>
                                                                <option value="user_manager">User Manager</option>
                                                                <option value="content_moderator">Content Moderator</option>
                                                                <option value="billing_admin">Billing Admin</option>
                                                                <option value="ADMIN">Admin</option>
                                                            </select>
                                                            <button
                                                                type="submit"
                                                                className="px-2.5 py-1 text-xs rounded-lg font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                                                            >
                                                                Apply
                                                            </button>
                                                        </form>
                                                    )}

                                                    {isBillingAdmin && (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleQuota(user.id)}
                                                            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg font-medium bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 transition-colors"
                                                        >
                                                            Quota {quotaExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                                        </button>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => toggleNotify(user.id)}
                                                        className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg font-medium bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors"
                                                    >
                                                        <Bell size={11} /> Notify {notifyExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                                    </button>

                                                    <form action={deleteUser}>
                                                        <input type="hidden" name="userId" value={user.id} />
                                                        <button
                                                            type="submit"
                                                            className="px-2.5 py-1 text-xs rounded-lg font-medium bg-gray-700 text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                                                        >
                                                            Delete
                                                        </button>
                                                    </form>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                    {quotaExpanded && !isCurrentUser && (
                                        <QuotaForm
                                            key={`${user.id}-quota`}
                                            user={user}
                                            onClose={() => toggleQuota(user.id)}
                                        />
                                    )}
                                    {notifyExpanded && !isCurrentUser && (
                                        <NotifyForm
                                            key={`${user.id}-notify`}
                                            user={user}
                                            onClose={() => toggleNotify(user.id)}
                                        />
                                    )}
                                </>
                            );
                        })}
                    </tbody>
                </table>
                {users.length === 0 && (
                    <p className="p-8 text-center text-gray-500 text-sm">No users yet</p>
                )}
            </div>
        </div>
    );
}
