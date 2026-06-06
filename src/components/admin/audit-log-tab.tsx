"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

interface AuditEntry {
    id: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    targetLabel: string | null;
    metadata: string | null;
    createdAt: string;
    actor: { id: string; name: string | null; email: string | null };
}

interface ApiResponse {
    logs: AuditEntry[];
    total: number;
    page: number;
    pages: number;
    limit: number;
}

const ACTION_COLORS: Record<string, string> = {
    BAN_USER: "bg-red-500/20 text-red-400",
    DELETE_USER: "bg-red-500/20 text-red-400",
    DELETE_API_KEY: "bg-red-500/20 text-red-400",
    DELETE_PAGE: "bg-red-500/20 text-red-400",
    UNBAN_USER: "bg-green-500/20 text-green-400",
    CREATE_PAGE: "bg-green-500/20 text-green-400",
    ADD_API_KEY: "bg-green-500/20 text-green-400",
    PROMOTE_USER: "bg-purple-500/20 text-purple-400",
    DEMOTE_USER: "bg-orange-500/20 text-orange-400",
    SET_ACTIVE_API_KEY: "bg-blue-500/20 text-blue-400",
    CHANGE_PASSWORD: "bg-blue-500/20 text-blue-400",
};

const DEFAULT_COLOR = "bg-gray-700 text-gray-300";

const ALL_ACTIONS = [
    "BAN_USER", "UNBAN_USER", "PROMOTE_USER", "DEMOTE_USER", "DELETE_USER",
    "ADD_API_KEY", "DELETE_API_KEY", "SET_ACTIVE_API_KEY",
    "UPDATE_MODEL_CONFIG", "UPDATE_MULTI_MODEL_CONFIG", "UPDATE_RATE_LIMIT",
    "UPDATE_SMTP", "UPDATE_EMAIL_SETTINGS", "UPDATE_TURNSTILE", "UPDATE_GOOGLE_OAUTH",
    "UPDATE_AI_RULES", "CREATE_PAGE", "UPDATE_PAGE", "DELETE_PAGE", "TOGGLE_PAGE_PUBLISHED",
    "UPDATE_WIDGET", "UPDATE_FILE_SETTINGS", "UPDATE_COHERE", "UPDATE_TOOLS",
    "CHANGE_PASSWORD",
];

function actionLabel(action: string) {
    return action.replace(/_/g, " ");
}

function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function MetadataCell({ raw }: { raw: string | null }) {
    if (!raw) return <span className="text-gray-600">—</span>;
    try {
        const obj = JSON.parse(raw);
        return (
            <span className="text-xs text-gray-400 font-mono">
                {Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(", ")}
            </span>
        );
    } catch {
        return <span className="text-xs text-gray-400">{raw}</span>;
    }
}

export function AuditLogTab() {
    const [data, setData] = useState<ApiResponse | null>(null);
    const [page, setPage] = useState(1);
    const [action, setAction] = useState("");
    const [loading, setLoading] = useState(true);

    const fetch_ = useCallback(async (p: number, a: string) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(p), limit: "50" });
            if (a) params.set("action", a);
            const res = await fetch(`/api/admin/audit-log?${params}`);
            const json = await res.json();
            setData(json);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetch_(page, action); }, [fetch_, page, action]);

    function handleActionChange(val: string) {
        setAction(val);
        setPage(1);
    }

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
                <select
                    value={action}
                    onChange={(e) => handleActionChange(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">All actions</option>
                    {ALL_ACTIONS.map((a) => (
                        <option key={a} value={a}>{actionLabel(a)}</option>
                    ))}
                </select>

                <button
                    onClick={() => fetch_(page, action)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors"
                >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    Refresh
                </button>

                {data && (
                    <span className="ml-auto text-sm text-gray-500">
                        {data.total} {data.total === 1 ? "entry" : "entries"}
                    </span>
                )}
            </div>

            {/* Table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-800 text-left text-gray-400 text-xs uppercase tracking-wider">
                                <th className="p-4 font-medium whitespace-nowrap">Time</th>
                                <th className="p-4 font-medium">Actor</th>
                                <th className="p-4 font-medium">Action</th>
                                <th className="p-4 font-medium">Target</th>
                                <th className="p-4 font-medium">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {loading && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-500 text-sm">
                                        Loading…
                                    </td>
                                </tr>
                            )}
                            {!loading && data?.logs.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-500 text-sm">
                                        No audit entries found
                                    </td>
                                </tr>
                            )}
                            {!loading && data?.logs.map((entry) => (
                                <tr key={entry.id} className="hover:bg-gray-800/40 transition-colors">
                                    <td className="p-4 text-gray-400 whitespace-nowrap text-xs">
                                        {formatDate(entry.createdAt)}
                                    </td>
                                    <td className="p-4">
                                        <div className="font-medium text-sm">{entry.actor.name || "—"}</div>
                                        <div className="text-xs text-gray-500">{entry.actor.email}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${ACTION_COLORS[entry.action] || DEFAULT_COLOR}`}>
                                            {actionLabel(entry.action)}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        {entry.targetLabel ? (
                                            <span className="text-sm">{entry.targetLabel}</span>
                                        ) : (
                                            <span className="text-gray-600">—</span>
                                        )}
                                        {entry.targetType && (
                                            <div className="text-xs text-gray-500 capitalize">{entry.targetType}</div>
                                        )}
                                    </td>
                                    <td className="p-4 max-w-xs truncate">
                                        <MetadataCell raw={entry.metadata} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            {data && data.pages > 1 && (
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="flex items-center gap-1 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft size={14} /> Previous
                    </button>
                    <span className="text-sm text-gray-400">
                        Page {page} of {data.pages}
                    </span>
                    <button
                        onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                        disabled={page === data.pages}
                        className="flex items-center gap-1 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        Next <ChevronRight size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}
