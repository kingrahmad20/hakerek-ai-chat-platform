"use client";

import { useEffect, useState } from "react";
import { Users, MessageSquare, Database, Zap, DollarSign, TrendingUp, ThumbsUp, ThumbsDown, CreditCard } from "lucide-react";
import { BarChart, LineChart, ReactionTrendChart } from "@/components/ui/charts";

interface Props {
    usersCount: number;
    chatsCount: number;
    messagesCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
}

interface ModelStat {
    model: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
}

interface DailyStat {
    date: string;
    activeUsers: number;
    requests: number;
    tokens: number;
    cost: number;
}

interface TopUserStat {
    userId: string | null;
    name: string;
    requests: number;
    totalTokens: number;
}

interface Analytics {
    byModel: ModelStat[];
    totalEstimatedCostUsd: number;
    monthlyEstimateUsd: number;
    activeUsersLast30: number;
    dailyStats: DailyStat[];
    topUsers: TopUserStat[];
    range: number;
}

interface LowQualityMessage {
    messageId: string;
    chatId: string;
    chatTitle: string;
    userEmail: string | null;
    userName: string | null;
    preview: string;
    thumbsDown: number;
    thumbsUp: number;
    createdAt: string;
}

interface DailyReaction {
    date: string;
    thumbsUp: number;
    thumbsDown: number;
}

interface ModelQualityStat {
    model: string;
    thumbsUp: number;
    thumbsDown: number;
    total: number;
    approvalRate: number | null;
}

interface ReactionAnalytics {
    thumbsUp: number;
    thumbsDown: number;
    emojiCounts: { type: string; count: number }[];
    dailyReactions: DailyReaction[];
    lowQuality: LowQualityMessage[];
    modelQuality: ModelQualityStat[];
    range: number;
}

function fmt(n: number) { return n.toLocaleString(); }
function fmtUsd(n: number) {
    if (n < 0.01) return "< $0.01";
    return "$" + n.toFixed(n < 1 ? 4 : 2);
}
function shortModel(m: string) {
    const parts = m.split("/");
    return parts[parts.length - 1] ?? m;
}

const RANGE_OPTIONS = [
    { label: "7d", value: 7 },
    { label: "30d", value: 30 },
    { label: "90d", value: 90 },
];

interface Credits {
    totalCredits: number;
    totalUsage: number;
    balance: number;
}

export function DashboardTab({ usersCount, chatsCount, messagesCount, totalInputTokens, totalOutputTokens }: Props) {
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [reactionAnalytics, setReactionAnalytics] = useState<ReactionAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState(30);
    const [credits, setCredits] = useState<Credits | null>(null);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            fetch(`/api/admin/analytics?range=${range}`).then(r => r.json()),
            fetch(`/api/admin/reactions?range=${range}`).then(r => r.json()),
        ])
            .then(([analyticsData, reactionsData]) => {
                setAnalytics(analyticsData);
                setReactionAnalytics(reactionsData);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [range]);

    useEffect(() => {
        fetch("/api/admin/openrouter-credits")
            .then((r) => r.json())
            .then((d) => {
                if (d?.data) {
                    const total = d.data.total_credits ?? 0;
                    const used = d.data.total_usage ?? 0;
                    setCredits({ totalCredits: total, totalUsage: used, balance: total - used });
                }
            })
            .catch(() => {});
    }, []);

    const totalTokens = totalInputTokens + totalOutputTokens;

    const cards = [
        { label: "Total Users", value: fmt(usersCount), icon: <Users size={20} />, color: "text-blue-400 bg-blue-500/20" },
        { label: "Total Chats", value: fmt(chatsCount), icon: <MessageSquare size={20} />, color: "text-purple-400 bg-purple-500/20" },
        { label: "Total Messages", value: fmt(messagesCount), icon: <Database size={20} />, color: "text-pink-400 bg-pink-500/20" },
        { label: "Total Tokens", value: fmt(totalTokens), icon: <Zap size={20} />, color: "text-orange-400 bg-orange-500/20" },
        {
            label: "Active (30 days)",
            value: loading ? "…" : fmt(analytics?.activeUsersLast30 ?? 0),
            icon: <TrendingUp size={20} />,
            color: "text-green-400 bg-green-500/20",
        },
        {
            label: "Est. Monthly Cost",
            value: loading ? "…" : fmtUsd(analytics?.monthlyEstimateUsd ?? 0),
            icon: <DollarSign size={20} />,
            color: "text-yellow-400 bg-yellow-500/20",
        },
        {
            label: "OR Credit Balance",
            value: credits === null ? "…" : fmtUsd(credits.balance),
            icon: <CreditCard size={20} />,
            color: credits !== null && credits.balance < 1 ? "text-red-400 bg-red-500/20" : "text-emerald-400 bg-emerald-500/20",
        },
    ];

    const topModels = analytics?.byModel.slice(0, 10).map(m => ({
        ...m,
        label: shortModel(m.model),
    })) ?? [];

    const dailyData = analytics?.dailyStats ?? [];

    const topUsers = analytics?.topUsers.map(u => ({
        ...u,
        label: u.name,
    })) ?? [];

    return (
        <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
                {cards.map((card) => (
                    <div key={card.label} className="bg-gray-900 border border-gray-800 p-5 rounded-xl">
                        <div className="flex items-center justify-between mb-3">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.color}`}>
                                {card.icon}
                            </div>
                        </div>
                        <p className="text-xl font-bold text-white">{card.value}</p>
                        <p className="text-xs text-gray-500 mt-1">{card.label}</p>
                    </div>
                ))}
            </div>

            {/* Range selector */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Trend period:</span>
                {RANGE_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() => setRange(opt.value)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                            range === opt.value
                                ? "bg-blue-600 text-white"
                                : "bg-gray-800 text-gray-400 hover:text-white"
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* Trend line charts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider mb-4">
                        Daily Active Users
                    </h2>
                    {loading
                        ? <p className="text-xs text-gray-600 animate-pulse">Loading…</p>
                        : <LineChart data={dailyData} valueKey="activeUsers" stroke="#22c55e" />
                    }
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider mb-4">
                        Message Volume / Day
                    </h2>
                    {loading
                        ? <p className="text-xs text-gray-600 animate-pulse">Loading…</p>
                        : <LineChart data={dailyData} valueKey="requests" stroke="#a855f7" />
                    }
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider mb-4">
                        Daily Token Cost
                    </h2>
                    {loading
                        ? <p className="text-xs text-gray-600 animate-pulse">Loading…</p>
                        : <LineChart data={dailyData} valueKey="cost" stroke="#eab308" formatVal={fmtUsd} />
                    }
                </div>
            </div>

            {/* Token Breakdown */}
            {totalTokens > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider mb-4">Token Breakdown</h2>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Input (Prompt)</p>
                            <p className="text-xl font-bold text-gray-300">{fmt(totalInputTokens)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Output (Completion)</p>
                            <p className="text-xl font-bold text-gray-300">{fmt(totalOutputTokens)}</p>
                        </div>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-orange-500 rounded-full"
                            style={{ width: totalTokens > 0 ? `${(totalInputTokens / totalTokens) * 100}%` : "0%" }}
                        />
                    </div>
                    <p className="text-xs text-gray-600 mt-1">Orange = input, rest = output</p>
                </div>
            )}

            {/* Token per Model */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider mb-4">Token per Model</h2>
                {loading
                    ? <p className="text-xs text-gray-600 animate-pulse">Loading…</p>
                    : <BarChart data={topModels} valueKey="totalTokens" labelKey="label" color="bg-blue-500" />
                }
            </div>

            {/* Token Cost by Model */}
            {!loading && topModels.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-x-auto">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider">Token Cost by Model</h2>
                        <span className="text-xs text-gray-500">
                            Total: <span className="text-yellow-400 font-medium">{fmtUsd(analytics?.totalEstimatedCostUsd ?? 0)}</span>
                        </span>
                    </div>
                    <div className="mb-5">
                        <BarChart data={topModels} valueKey="estimatedCostUsd" labelKey="label"
                            color="bg-yellow-500" formatVal={fmtUsd} />
                    </div>
                    <table className="w-full text-sm min-w-[500px]">
                        <thead>
                            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                                <th className="pb-2 font-medium">Model</th>
                                <th className="pb-2 font-medium text-right">Requests</th>
                                <th className="pb-2 font-medium text-right">Input Tok</th>
                                <th className="pb-2 font-medium text-right">Output Tok</th>
                                <th className="pb-2 font-medium text-right">Est. Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topModels.map((m, i) => (
                                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                                    <td className="py-2.5 text-gray-300 font-mono text-xs">{m.model}</td>
                                    <td className="py-2.5 text-right text-gray-400">{fmt(m.requests)}</td>
                                    <td className="py-2.5 text-right text-gray-400">{fmt(m.inputTokens)}</td>
                                    <td className="py-2.5 text-right text-gray-400">{fmt(m.outputTokens)}</td>
                                    <td className="py-2.5 text-right text-yellow-400 font-medium">{fmtUsd(m.estimatedCostUsd)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Top Users by Usage */}
            {!loading && topUsers.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider mb-4">
                        Top Users by Usage
                    </h2>
                    <BarChart data={topUsers} valueKey="totalTokens" labelKey="label" color="bg-cyan-500" />
                </div>
            )}

            {/* Reaction Feedback */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider mb-4">
                    Response Feedback
                </h2>
                {loading ? (
                    <p className="text-xs text-gray-600 animate-pulse">Loading…</p>
                ) : (
                    <div className="space-y-6">
                        {/* Reaction trend chart */}
                        <ReactionTrendChart data={reactionAnalytics?.dailyReactions ?? []} />

                        {/* Thumbs summary */}
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-5 py-4">
                                <ThumbsUp size={20} className="text-green-400" />
                                <div>
                                    <p className="text-2xl font-bold text-white">{fmt(reactionAnalytics?.thumbsUp ?? 0)}</p>
                                    <p className="text-xs text-gray-500">Helpful</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4">
                                <ThumbsDown size={20} className="text-red-400" />
                                <div>
                                    <p className="text-2xl font-bold text-white">{fmt(reactionAnalytics?.thumbsDown ?? 0)}</p>
                                    <p className="text-xs text-gray-500">Not Helpful</p>
                                </div>
                            </div>
                            {(reactionAnalytics?.emojiCounts ?? []).length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    {(reactionAnalytics?.emojiCounts ?? []).map((e) => (
                                        <div key={e.type} className="flex items-center gap-1.5 bg-gray-800 rounded-xl px-3 py-2">
                                            <span className="text-base">{e.type}</span>
                                            <span className="text-sm font-semibold text-gray-300">{fmt(e.count)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Approval rate */}
                        {(reactionAnalytics?.thumbsUp ?? 0) + (reactionAnalytics?.thumbsDown ?? 0) > 0 && (() => {
                            const total = (reactionAnalytics?.thumbsUp ?? 0) + (reactionAnalytics?.thumbsDown ?? 0);
                            const pct = Math.round(((reactionAnalytics?.thumbsUp ?? 0) / total) * 100);
                            return (
                                <div>
                                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                                        <span>Approval rate</span>
                                        <span className={pct >= 70 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-red-400"}>
                                            {pct}%
                                        </span>
                                    </div>
                                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Quality by Model */}
                        {(reactionAnalytics?.modelQuality ?? []).length > 0 && (
                            <div>
                                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                                    Quality by Model
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm min-w-[480px]">
                                        <thead>
                                            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                                                <th className="pb-2 font-medium">Model</th>
                                                <th className="pb-2 font-medium text-right">Helpful</th>
                                                <th className="pb-2 font-medium text-right">Not Helpful</th>
                                                <th className="pb-2 font-medium text-right">Rated</th>
                                                <th className="pb-2 font-medium text-right pr-2">Approval</th>
                                                <th className="pb-2 font-medium w-32"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(reactionAnalytics?.modelQuality ?? []).map((m) => (
                                                <tr key={m.model} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                                                    <td className="py-2.5 text-gray-300 font-mono text-xs truncate max-w-[180px]" title={m.model}>
                                                        {shortModel(m.model)}
                                                    </td>
                                                    <td className="py-2.5 text-right text-green-400">{fmt(m.thumbsUp)}</td>
                                                    <td className="py-2.5 text-right text-red-400">{fmt(m.thumbsDown)}</td>
                                                    <td className="py-2.5 text-right text-gray-400">{fmt(m.total)}</td>
                                                    <td className="py-2.5 text-right pr-2 font-medium">
                                                        {m.approvalRate === null ? (
                                                            <span className="text-gray-600">—</span>
                                                        ) : (
                                                            <span className={m.approvalRate >= 70 ? "text-green-400" : m.approvalRate >= 50 ? "text-yellow-400" : "text-red-400"}>
                                                                {m.approvalRate}%
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5">
                                                        {m.approvalRate !== null && (
                                                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full ${m.approvalRate >= 70 ? "bg-green-500" : m.approvalRate >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                                                                    style={{ width: `${m.approvalRate}%` }}
                                                                />
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Low quality messages */}
                        {(reactionAnalytics?.lowQuality ?? []).length > 0 && (
                            <div>
                                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                                    Most Downvoted Responses
                                </h3>
                                <div className="space-y-2">
                                    {(reactionAnalytics?.lowQuality ?? []).map((item) => (
                                        <div key={item.messageId} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4">
                                            <div className="flex items-start justify-between gap-4 mb-2">
                                                <div className="min-w-0">
                                                    <p className="text-xs text-gray-400 truncate">
                                                        <span className="text-gray-300">{item.chatTitle}</span>
                                                        {item.userEmail && <span className="ml-2 text-gray-600">· {item.userEmail}</span>}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <span className="flex items-center gap-1 text-xs text-red-400">
                                                        <ThumbsDown size={11} /> {item.thumbsDown}
                                                    </span>
                                                    {item.thumbsUp > 0 && (
                                                        <span className="flex items-center gap-1 text-xs text-green-400">
                                                            <ThumbsUp size={11} /> {item.thumbsUp}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                                                {item.preview}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
