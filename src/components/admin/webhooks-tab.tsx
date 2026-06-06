"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, RefreshCw, RotateCcw, CheckCircle, Clock, XCircle } from "lucide-react";

interface WebhookFailure {
    id: string;
    event: string;
    status: number;
    retryCount: number;
    nextRetryAt: string | null;
    lastError: string | null;
    createdAt: string;
    webhook: {
        id: string;
        name: string;
        url: string;
        user: { email: string | null };
    };
}

interface Stats {
    totalFailed: number;
    pendingRetries: number;
    dueNow: number;
    recentFailures: WebhookFailure[];
}

const RETRY_SCHEDULE = ["1 min", "5 min", "30 min", "2 h"];

function formatDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatRelative(iso: string) {
    const diff = new Date(iso).getTime() - Date.now();
    const abs = Math.abs(diff);
    if (abs < 60_000) return diff < 0 ? "now" : "< 1 min";
    if (abs < 3_600_000) return `${Math.round(abs / 60_000)} min`;
    return `${Math.round(abs / 3_600_000)} h`;
}

function RetryBadge({ retryCount, nextRetryAt }: { retryCount: number; nextRetryAt: string | null }) {
    if (retryCount === 0 && nextRetryAt === null) {
        return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-400">Not retried</span>;
    }
    if (nextRetryAt === null) {
        return <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400">Exhausted ({retryCount}/4)</span>;
    }
    const due = new Date(nextRetryAt).getTime() <= Date.now();
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs ${due ? "bg-orange-500/20 text-orange-400" : "bg-yellow-500/20 text-yellow-400"}`}>
            {due ? "Due now" : `In ${formatRelative(nextRetryAt)}`} · {retryCount}/{RETRY_SCHEDULE.length}
        </span>
    );
}

export function WebhooksTab() {
    const [data, setData] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [retrying, setRetrying] = useState(false);
    const [retryResult, setRetryResult] = useState<{ processed: number; succeeded: number } | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/webhooks");
            const json = await res.json();
            setData(json);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    async function handleProcessRetries() {
        setRetrying(true);
        setRetryResult(null);
        try {
            const res = await fetch("/api/admin/webhooks", { method: "POST" });
            const result = await res.json();
            setRetryResult(result);
            await fetchData();
        } finally {
            setRetrying(false);
        }
    }

    const hasIssues = data && (data.dueNow > 0 || data.totalFailed > 0);

    return (
        <div className="space-y-6">
            {/* Alert banner */}
            {!loading && hasIssues && (
                <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <AlertTriangle className="text-red-400 mt-0.5 shrink-0" size={18} />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-red-400">Webhook Delivery Failures Detected</p>
                        <p className="text-xs text-red-300/80 mt-0.5">
                            {data.totalFailed > 0 && `${data.totalFailed} delivery${data.totalFailed === 1 ? "" : "ies"} exhausted all retries. `}
                            {data.dueNow > 0 && `${data.dueNow} delivery${data.dueNow === 1 ? "" : "ies"} ready to retry now.`}
                        </p>
                    </div>
                    <button
                        onClick={handleProcessRetries}
                        disabled={retrying || data.dueNow === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                        <RotateCcw size={12} className={retrying ? "animate-spin" : ""} />
                        Retry Now
                    </button>
                </div>
            )}

            {/* Retry result feedback */}
            {retryResult && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-400">
                    <CheckCircle size={15} />
                    Processed {retryResult.processed} delivery{retryResult.processed === 1 ? "" : "ies"} — {retryResult.succeeded} succeeded.
                </div>
            )}

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <XCircle size={16} className="text-red-400" />
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Exhausted</p>
                    </div>
                    <p className="text-2xl font-bold text-white">{loading ? "…" : data?.totalFailed ?? 0}</p>
                    <p className="text-xs text-gray-600 mt-1">All 4 retries failed</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock size={16} className="text-yellow-400" />
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Pending</p>
                    </div>
                    <p className="text-2xl font-bold text-white">{loading ? "…" : data?.pendingRetries ?? 0}</p>
                    <p className="text-xs text-gray-600 mt-1">Scheduled for later</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <RotateCcw size={16} className="text-orange-400" />
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Due Now</p>
                    </div>
                    <p className="text-2xl font-bold text-white">{loading ? "…" : data?.dueNow ?? 0}</p>
                    <p className="text-xs text-gray-600 mt-1">Ready to retry</p>
                </div>
            </div>

            {/* Retry schedule legend */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">Backoff schedule:</span>
                {RETRY_SCHEDULE.map((label, i) => (
                    <span key={i} className="px-2 py-0.5 text-xs bg-gray-800 text-gray-400 rounded-full">
                        Retry {i + 1}: +{label}
                    </span>
                ))}
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
                <button
                    onClick={fetchData}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors"
                >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    Refresh
                </button>
                <button
                    onClick={handleProcessRetries}
                    disabled={retrying || (data?.dueNow ?? 0) === 0}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-orange-600/20 border border-orange-600/40 text-orange-400 rounded-lg hover:bg-orange-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <RotateCcw size={14} className={retrying ? "animate-spin" : ""} />
                    Process Retries
                </button>
                {data && (
                    <span className="ml-auto text-sm text-gray-500">
                        {data.recentFailures.length} recent failure{data.recentFailures.length === 1 ? "" : "s"}
                    </span>
                )}
            </div>

            {/* Failures table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-800 text-left text-gray-400 text-xs uppercase tracking-wider">
                                <th className="p-4 font-medium whitespace-nowrap">Time</th>
                                <th className="p-4 font-medium">Webhook</th>
                                <th className="p-4 font-medium">Event</th>
                                <th className="p-4 font-medium">HTTP</th>
                                <th className="p-4 font-medium">Retry Status</th>
                                <th className="p-4 font-medium">Error</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {loading && (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-500 text-sm">Loading…</td>
                                </tr>
                            )}
                            {!loading && data?.recentFailures.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-500 text-sm">
                                        No failed deliveries — all webhooks are healthy.
                                    </td>
                                </tr>
                            )}
                            {!loading && data?.recentFailures.map((entry) => (
                                <tr key={entry.id} className="hover:bg-gray-800/40 transition-colors">
                                    <td className="p-4 text-gray-400 whitespace-nowrap text-xs">
                                        {formatDate(entry.createdAt)}
                                    </td>
                                    <td className="p-4">
                                        <div className="font-medium text-sm text-white">{entry.webhook.name}</div>
                                        <div className="text-xs text-gray-500 truncate max-w-[180px]" title={entry.webhook.url}>
                                            {entry.webhook.url}
                                        </div>
                                        <div className="text-xs text-gray-600">{entry.webhook.user.email}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-400 font-mono">
                                            {entry.event}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <span className={`font-mono text-sm ${entry.status === 0 ? "text-gray-500" : "text-red-400"}`}>
                                            {entry.status === 0 ? "—" : entry.status}
                                        </span>
                                    </td>
                                    <td className="p-4 whitespace-nowrap">
                                        <RetryBadge retryCount={entry.retryCount} nextRetryAt={entry.nextRetryAt} />
                                    </td>
                                    <td className="p-4 max-w-[200px]">
                                        {entry.lastError ? (
                                            <span className="text-xs text-gray-400 font-mono truncate block" title={entry.lastError}>
                                                {entry.lastError}
                                            </span>
                                        ) : (
                                            <span className="text-gray-600">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
