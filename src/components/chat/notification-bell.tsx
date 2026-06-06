"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, BellRing, BellOff, X, Check, CheckCheck, Trash2, Users, Share2, Brain, FileText, Megaphone, Clock, DollarSign } from "lucide-react";
import type { NotificationItem, NotificationType } from "@/types";
import { isPushSupported, getPushPermission, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";

const POLL_INTERVAL_MS = 60_000;

function typeIcon(type: NotificationType) {
    switch (type) {
        case "workspace_member_joined": return <Users size={14} className="text-blue-400 shrink-0" />;
        case "shared_chat_viewed":      return <Share2 size={14} className="text-green-400 shrink-0" />;
        case "memory_saved":            return <Brain size={14} className="text-purple-400 shrink-0" />;
        case "document_ready":          return <FileText size={14} className="text-yellow-400 shrink-0" />;
        case "admin_announcement":      return <Megaphone size={14} className="text-orange-400 shrink-0" />;
        case "scheduled_agent":         return <Clock size={14} className="text-indigo-400 shrink-0" />;
        case "budget_alert":            return <DollarSign size={14} className="text-red-400 shrink-0" />;
    }
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1)  return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell({ userId }: { userId: string }) {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [pushSupported, setPushSupported] = useState(false);
    const [pushOn, setPushOn] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const bellRef = useRef<HTMLButtonElement>(null);

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await fetch("/api/notifications?limit=30");
            if (!res.ok) return;
            const data = await res.json();
            setNotifications(data.notifications ?? []);
            setUnreadCount(data.unreadCount ?? 0);
        } catch { /* ignore */ }
    }, []);

    // Initial fetch + polling
    useEffect(() => {
        if (!userId) return;
        fetchNotifications();
        const id = setInterval(fetchNotifications, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [userId, fetchNotifications]);

    // Detect Web Push support + whether this browser is already subscribed
    useEffect(() => {
        if (!isPushSupported()) return;
        setPushSupported(true);
        let cancelled = false;
        (async () => {
            try {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.getSubscription();
                if (!cancelled) setPushOn(getPushPermission() === "granted" && !!sub);
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, []);

    const togglePush = async () => {
        setPushBusy(true);
        try {
            if (pushOn) {
                await unsubscribeFromPush();
                setPushOn(false);
            } else {
                const ok = await subscribeToPush();
                setPushOn(ok);
            }
        } finally { setPushBusy(false); }
    };

    // Close panel on outside click
    useEffect(() => {
        if (!open) return;
        function onMouseDown(e: MouseEvent) {
            if (
                panelRef.current && !panelRef.current.contains(e.target as Node) &&
                bellRef.current && !bellRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, [open]);

    const openPanel = () => {
        setOpen((prev) => !prev);
    };

    const markAllRead = async () => {
        setLoading(true);
        try {
            await fetch("/api/notifications", { method: "PATCH" });
            setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
            setUnreadCount(0);
        } finally { setLoading(false); }
    };

    const markOneRead = async (id: string) => {
        await fetch(`/api/notifications/${id}`, { method: "PATCH" });
        setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
        setUnreadCount((c) => Math.max(0, c - 1));
    };

    const deleteOne = async (id: string) => {
        const n = notifications.find((x) => x.id === id);
        await fetch(`/api/notifications/${id}`, { method: "DELETE" });
        setNotifications((prev) => prev.filter((x) => x.id !== id));
        if (n && !n.read) setUnreadCount((c) => Math.max(0, c - 1));
    };

    const clearAll = async () => {
        setLoading(true);
        try {
            await fetch("/api/notifications", { method: "DELETE" });
            setNotifications([]);
            setUnreadCount(0);
        } finally { setLoading(false); }
    };

    return (
        <div className="relative">
            {/* Bell button */}
            <button
                ref={bellRef}
                onClick={openPanel}
                title="Notifications"
                className="relative p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
            >
                <Bell size={18} />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white leading-none">
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown panel */}
            {open && (
                <div
                    ref={panelRef}
                    className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl flex flex-col overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                        <span className="text-sm font-semibold text-white">Notifications</span>
                        <div className="flex items-center gap-1">
                            {pushSupported && (
                                <button
                                    onClick={togglePush}
                                    disabled={pushBusy}
                                    title={pushOn ? "Disable push notifications" : "Enable push notifications"}
                                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${pushOn ? "text-blue-400 hover:bg-gray-800" : "text-gray-400 hover:text-white hover:bg-gray-800"}`}
                                >
                                    {pushOn ? <BellRing size={14} /> : <BellOff size={14} />}
                                </button>
                            )}
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllRead}
                                    disabled={loading}
                                    title="Mark all as read"
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-40"
                                >
                                    <CheckCheck size={14} />
                                </button>
                            )}
                            {notifications.length > 0 && (
                                <button
                                    onClick={clearAll}
                                    disabled={loading}
                                    title="Clear all"
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors disabled:opacity-40"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                            <button
                                onClick={() => setOpen(false)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Notification list */}
                    <div className="overflow-y-auto max-h-96 divide-y divide-gray-800/60">
                        {notifications.length === 0 ? (
                            <div className="py-10 text-center text-sm text-gray-500">
                                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                                No notifications yet
                            </div>
                        ) : (
                            notifications.map((n) => (
                                <div
                                    key={n.id}
                                    className={`group flex items-start gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors ${!n.read ? "bg-blue-500/5" : ""}`}
                                >
                                    <div className="mt-0.5">{typeIcon(n.type)}</div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs font-medium leading-snug ${n.read ? "text-gray-300" : "text-white"}`}>
                                            {n.title}
                                        </p>
                                        {n.body && (
                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                                        )}
                                        <p className="text-[10px] text-gray-600 mt-1">{timeAgo(n.createdAt)}</p>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                                        {!n.read && (
                                            <button
                                                onClick={() => markOneRead(n.id)}
                                                title="Mark as read"
                                                className="p-1 rounded text-gray-500 hover:text-blue-400 hover:bg-gray-700 transition-colors"
                                            >
                                                <Check size={12} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => deleteOne(n.id)}
                                            title="Dismiss"
                                            className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                    {!n.read && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
