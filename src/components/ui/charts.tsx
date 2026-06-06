/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useId } from "react";
import {
    ResponsiveContainer,
    BarChart as RBarChart,
    Bar,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
} from "recharts";

function fmt(n: number) {
    return n.toLocaleString();
}

/** Tailwind `bg-*-500` utility classes mapped to the hex Recharts needs. */
const COLOR_HEX: Record<string, string> = {
    "bg-blue-500": "#3b82f6",
    "bg-yellow-500": "#eab308",
    "bg-cyan-500": "#06b6d4",
    "bg-green-500": "#22c55e",
    "bg-purple-500": "#a855f7",
    "bg-pink-500": "#ec4899",
    "bg-orange-500": "#f97316",
};

function toHex(color: string) {
    return COLOR_HEX[color] ?? (color.startsWith("#") ? color : "#3b82f6");
}

const AXIS = { fill: "#6b7280", fontSize: 10 } as const;
const GRID = "#374151";

const TOOLTIP_STYLE = {
    contentStyle: {
        background: "#111827",
        border: "1px solid #1f2937",
        borderRadius: 8,
        fontSize: 12,
        color: "#e5e7eb",
    },
    labelStyle: { color: "#9ca3af", fontSize: 11 },
    cursor: { fill: "#1f2937", fillOpacity: 0.4 },
} as const;

function EmptyState() {
    return <p className="text-xs text-gray-600 py-4 text-center">No data</p>;
}

function truncate(s: string, max = 18) {
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Horizontal labelled bar chart. Each row is label + a proportional bar + value. */
export function BarChart({
    data,
    valueKey,
    labelKey,
    color,
    formatVal,
}: {
    data: any[];
    valueKey: string;
    labelKey: string;
    color: string;
    formatVal?: (v: number) => string;
}) {
    if (!data.length) return <EmptyState />;
    const fill = toHex(color);
    const tick = formatVal ?? fmt;
    const height = Math.max(data.length * 34 + 16, 60);

    return (
        <ResponsiveContainer width="100%" height={height}>
            <RBarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }} barCategoryGap={6}>
                <CartesianGrid horizontal={false} stroke={GRID} strokeDasharray="4 3" />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={tick} />
                <YAxis
                    type="category"
                    dataKey={labelKey}
                    width={128}
                    tick={AXIS}
                    tickLine={false}
                    axisLine={{ stroke: GRID }}
                    tickFormatter={(v: string) => truncate(String(v))}
                    interval={0}
                />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [tick(Number(v)), ""]} />
                <Bar dataKey={valueKey} fill={fill} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {data.map((_, i) => (
                        <Cell key={i} fill={fill} />
                    ))}
                </Bar>
            </RBarChart>
        </ResponsiveContainer>
    );
}

/** Single-series area/line chart over a date-keyed series. */
export function LineChart({
    data,
    valueKey,
    stroke,
    formatVal,
}: {
    data: ({ date: string } & Record<string, any>)[];
    valueKey: string;
    stroke: string;
    formatVal?: (v: number) => string;
}) {
    const uid = useId();
    const gradId = `g${uid.replace(/:/g, "")}`;

    if (!data.length) return <EmptyState />;

    const tick = formatVal ?? fmt;
    const labelStep = Math.max(Math.ceil(data.length / 8) - 1, 0);

    return (
        <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="4 3" />
                <XAxis
                    dataKey="date"
                    tick={AXIS}
                    tickLine={false}
                    axisLine={{ stroke: GRID }}
                    interval={labelStep}
                    tickFormatter={(v: string) => String(v).slice(5)}
                />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} tickFormatter={tick} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [tick(Number(v)), ""]} />
                <Area
                    type="monotone"
                    dataKey={valueKey}
                    stroke={stroke}
                    strokeWidth={1.8}
                    fill={`url(#${gradId})`}
                    isAnimationActive={false}
                    dot={data.length <= 32 ? { r: 2.5, fill: stroke, strokeWidth: 0 } : false}
                    activeDot={{ r: 3.5 }}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}

interface ReactionPoint {
    date: string;
    thumbsUp: number;
    thumbsDown: number;
}

/** Dual-series area chart for helpful vs. not-helpful reaction trends. */
export function ReactionTrendChart({ data }: { data: ReactionPoint[] }) {
    const uid = useId();
    const upId = `gu${uid.replace(/:/g, "")}`;
    const downId = `gd${uid.replace(/:/g, "")}`;

    if (!data.length) return <EmptyState />;

    const labelStep = Math.max(Math.ceil(data.length / 8) - 1, 0);

    return (
        <div>
            <div className="flex items-center gap-4 mb-2">
                <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className="inline-block w-3 h-0.5 bg-green-500 rounded" /> Helpful
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className="inline-block w-3 h-0.5 bg-red-500 rounded" /> Not Helpful
                </span>
            </div>
            <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                    <defs>
                        <linearGradient id={upId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.18} />
                            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id={downId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.18} />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="4 3" />
                    <XAxis
                        dataKey="date"
                        tick={AXIS}
                        tickLine={false}
                        axisLine={{ stroke: GRID }}
                        interval={labelStep}
                        tickFormatter={(v: string) => String(v).slice(5)}
                    />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Area
                        type="monotone"
                        dataKey="thumbsUp"
                        name="Helpful"
                        stroke="#22c55e"
                        strokeWidth={1.8}
                        fill={`url(#${upId})`}
                        isAnimationActive={false}
                        dot={data.length <= 32 ? { r: 2.5, fill: "#22c55e", strokeWidth: 0 } : false}
                        activeDot={{ r: 3.5 }}
                    />
                    <Area
                        type="monotone"
                        dataKey="thumbsDown"
                        name="Not Helpful"
                        stroke="#ef4444"
                        strokeWidth={1.8}
                        fill={`url(#${downId})`}
                        isAnimationActive={false}
                        dot={data.length <= 32 ? { r: 2.5, fill: "#ef4444", strokeWidth: 0 } : false}
                        activeDot={{ r: 3.5 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
