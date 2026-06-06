"use client";

import { useCallback, useEffect, useState } from "react";
import {
    Sparkles, Tags, Smile, Frown, Meh, TrendingUp, TrendingDown,
    AlertTriangle, RefreshCw, MessageSquare,
} from "lucide-react";
import { BarChart, LineChart } from "@/components/ui/charts";

interface TopicStat { topic: string; count: number; }
interface DailySentiment { date: string; positive: number; negative: number; total: number; }
interface SentimentSummary {
    counts: Record<string, number>;
    avgScore: number;
    daily: DailySentiment[];
}
interface TrendingQuestion {
    question: string;
    chatId: string;
    count: number;
    recent: number;
    earlier: number;
    negativeShare: number;
}
interface FlaggedChat {
    chatId: string;
    title: string;
    primaryQuestion: string | null;
    sentimentScore: number;
    topics: string[];
    createdAt: string;
    userEmail: string | null;
    userName: string | null;
}
interface Intelligence {
    coverage: { analyzed: number; total: number };
    topics: TopicStat[];
    sentiment: SentimentSummary;
    trendingQuestions: TrendingQuestion[];
    flagged: FlaggedChat[];
    range: number;
}

const RANGE_OPTIONS = [
    { label: "7d", value: 7 },
    { label: "30d", value: 30 },
    { label: "90d", value: 90 },
];

function fmt(n: number) { return n.toLocaleString(); }

export function ConversationIntelligenceTab() {
    const [data, setData] = useState<Intelligence | null>(null);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState(30);
    const [analyzing, setAnalyzing] = useState(false);
    const [progress, setProgress] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        fetch(`/api/admin/conversation-intelligence?range=${range}`)
            .then((r) => r.json())
            .then((d) => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [range]);

    useEffect(() => { load(); }, [load]);

    const runAnalysis = useCallback(async () => {
        setAnalyzing(true);
        setProgress("Starting…");
        let totalAnalyzed = 0;
        try {
            // Process in capped batches until nothing remains (or a batch stalls).
            for (let i = 0; i < 100; i++) {
                const res = await fetch("/api/admin/conversation-intelligence/analyze", { method: "POST" });
                const json = await res.json();
                if (!res.ok) { setProgress(json.error || "Analysis failed"); break; }
                totalAnalyzed += json.analyzed ?? 0;
                setProgress(`Analyzed ${totalAnalyzed} chat${totalAnalyzed === 1 ? "" : "s"}… (${json.remaining} remaining)`);
                if (!json.remaining || json.analyzed === 0) {
                    setProgress(`Done — analyzed ${totalAnalyzed} chat${totalAnalyzed === 1 ? "" : "s"}.`);
                    break;
                }
            }
        } catch {
            setProgress("Analysis failed");
        } finally {
            setAnalyzing(false);
            load();
        }
    }, [load]);

    const s = data?.sentiment;
    const total = (s?.counts.positive ?? 0) + (s?.counts.neutral ?? 0) + (s?.counts.negative ?? 0) + (s?.counts.mixed ?? 0);
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

    const coveragePct = data && data.coverage.total > 0
        ? Math.round((data.coverage.analyzed / data.coverage.total) * 100)
        : 0;

    return (
        <div className="space-y-6">
            {/* Header + analyze */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-violet-400 bg-violet-500/20 shrink-0">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h2 className="font-semibold text-white">Conversation Intelligence</h2>
                            <p className="text-xs text-gray-500 mt-1 max-w-xl">
                                An LLM pass over each chat auto-tags topics, flags sentiment, and clusters
                                what users actually ask. Run analysis to keep insights current as new chats arrive.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={runAnalysis}
                        disabled={analyzing}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                    >
                        <RefreshCw size={15} className={analyzing ? "animate-spin" : ""} />
                        {analyzing ? "Analyzing…" : "Run analysis"}
                    </button>
                </div>

                {/* Coverage bar */}
                <div className="mt-5">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Coverage</span>
                        <span className="text-gray-400">
                            {data ? `${fmt(data.coverage.analyzed)} / ${fmt(data.coverage.total)} chats analyzed` : "…"}
                        </span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${coveragePct}%` }} />
                    </div>
                    {progress && <p className="text-xs text-gray-500 mt-2">{progress}</p>}
                </div>
            </div>

            {/* Range selector */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Period:</span>
                {RANGE_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() => setRange(opt.value)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                            range === opt.value ? "bg-violet-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* Sentiment summary */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider mb-4">Sentiment</h2>
                {loading ? (
                    <p className="text-xs text-gray-600 animate-pulse">Loading…</p>
                ) : total === 0 ? (
                    <p className="text-xs text-gray-600">No analyzed conversations in this period yet.</p>
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <SentimentCard icon={<Smile size={18} />} label="Positive" value={s!.counts.positive ?? 0} pct={pct(s!.counts.positive ?? 0)} color="text-green-400 bg-green-500/10 border-green-500/20" />
                            <SentimentCard icon={<Meh size={18} />} label="Neutral" value={s!.counts.neutral ?? 0} pct={pct(s!.counts.neutral ?? 0)} color="text-gray-300 bg-gray-700/30 border-gray-600/30" />
                            <SentimentCard icon={<AlertTriangle size={18} />} label="Mixed" value={s!.counts.mixed ?? 0} pct={pct(s!.counts.mixed ?? 0)} color="text-amber-400 bg-amber-500/10 border-amber-500/20" />
                            <SentimentCard icon={<Frown size={18} />} label="Negative" value={s!.counts.negative ?? 0} pct={pct(s!.counts.negative ?? 0)} color="text-red-400 bg-red-500/10 border-red-500/20" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Positive / day</h3>
                                <LineChart data={s!.daily} valueKey="positive" stroke="#22c55e" />
                            </div>
                            <div>
                                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Negative / day</h3>
                                <LineChart data={s!.daily} valueKey="negative" stroke="#ef4444" />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Topics */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Tags size={15} /> Top Topics
                </h2>
                {loading ? (
                    <p className="text-xs text-gray-600 animate-pulse">Loading…</p>
                ) : (
                    <BarChart data={data?.topics ?? []} valueKey="count" labelKey="topic" color="bg-purple-500" />
                )}
            </div>

            {/* Trending questions */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <MessageSquare size={15} /> Trending Questions
                </h2>
                {loading ? (
                    <p className="text-xs text-gray-600 animate-pulse">Loading…</p>
                ) : (data?.trendingQuestions ?? []).length === 0 ? (
                    <p className="text-xs text-gray-600">
                        Not enough clustered questions yet. Run analysis and make sure messages are embedded.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {data!.trendingQuestions.map((q, i) => {
                            const trendUp = q.recent > q.earlier;
                            const flat = q.recent === q.earlier;
                            return (
                                <a
                                    key={i}
                                    href={`/admin?tab=chats&chatId=${q.chatId}`}
                                    className="flex items-center gap-3 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-xl px-4 py-3 transition-colors"
                                >
                                    <span className="text-sm font-bold text-violet-400 w-7 shrink-0">{q.count}×</span>
                                    <p className="text-sm text-gray-300 flex-1 line-clamp-2 leading-snug">{q.question}</p>
                                    {q.negativeShare >= 40 && (
                                        <span className="text-[10px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5 shrink-0">
                                            {q.negativeShare}% neg
                                        </span>
                                    )}
                                    {flat ? (
                                        <Meh size={15} className="text-gray-600 shrink-0" />
                                    ) : trendUp ? (
                                        <TrendingUp size={15} className="text-green-400 shrink-0" />
                                    ) : (
                                        <TrendingDown size={15} className="text-gray-500 shrink-0" />
                                    )}
                                </a>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Flagged conversations */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <AlertTriangle size={15} className="text-red-400" /> Flagged Conversations
                </h2>
                {loading ? (
                    <p className="text-xs text-gray-600 animate-pulse">Loading…</p>
                ) : (data?.flagged ?? []).length === 0 ? (
                    <p className="text-xs text-gray-600">No negative-sentiment conversations in this period. 🎉</p>
                ) : (
                    <div className="space-y-2">
                        {data!.flagged.map((c) => (
                            <a
                                key={c.chatId}
                                href={`/admin?tab=chats&chatId=${c.chatId}`}
                                className="block bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 rounded-xl p-4 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-4 mb-1">
                                    <p className="text-sm text-gray-200 truncate font-medium">{c.title}</p>
                                    <span className="text-xs text-red-400 shrink-0 font-mono">{c.sentimentScore.toFixed(2)}</span>
                                </div>
                                {c.primaryQuestion && (
                                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{c.primaryQuestion}</p>
                                )}
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    {c.topics.slice(0, 3).map((t) => (
                                        <span key={t} className="text-[10px] text-gray-400 bg-gray-700/50 rounded px-1.5 py-0.5">{t}</span>
                                    ))}
                                    {(c.userEmail || c.userName) && (
                                        <span className="text-[10px] text-gray-600 ml-auto">{c.userName || c.userEmail}</span>
                                    )}
                                </div>
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function SentimentCard({ icon, label, value, pct, color }: {
    icon: React.ReactNode; label: string; value: number; pct: number; color: string;
}) {
    return (
        <div className={`rounded-xl border px-4 py-3 ${color}`}>
            <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs">{label}</span></div>
            <p className="text-xl font-bold text-white">{fmt(value)}</p>
            <p className="text-[11px] opacity-70">{pct}%</p>
        </div>
    );
}
