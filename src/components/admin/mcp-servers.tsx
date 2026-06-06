"use client";

import { useActionState, useState } from "react";
import { saveMcpServers, type McpServerItem } from "@/app/admin/actions";
import { Plug, Plus, Trash2, ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface Props {
    servers: McpServerItem[];
}

type TestState = { status: "idle" | "loading" | "ok" | "error"; message?: string };

function newServer(): McpServerItem {
    return {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        url: "",
        transport: "http",
        headers: [],
        enabled: true,
    };
}

export function McpServersManager({ servers: initial }: Props) {
    const [result, action, isPending] = useActionState(saveMcpServers, null);
    const [servers, setServers] = useState<McpServerItem[]>(initial);
    const [expanded, setExpanded] = useState<string | null>(initial.length === 0 ? null : null);
    const [tests, setTests] = useState<Record<string, TestState>>({});

    const update = (id: string, patch: Partial<McpServerItem>) =>
        setServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

    const remove = (id: string) => setServers((prev) => prev.filter((s) => s.id !== id));

    const add = () => {
        const s = newServer();
        setServers((prev) => [...prev, s]);
        setExpanded(s.id);
    };

    const addHeader = (id: string) =>
        setServers((prev) =>
            prev.map((s) => (s.id === id ? { ...s, headers: [...s.headers, { key: "", value: "" }] } : s)),
        );

    const updateHeader = (id: string, idx: number, patch: Partial<{ key: string; value: string }>) =>
        setServers((prev) =>
            prev.map((s) =>
                s.id === id
                    ? { ...s, headers: s.headers.map((h, i) => (i === idx ? { ...h, ...patch } : h)) }
                    : s,
            ),
        );

    const removeHeader = (id: string, idx: number) =>
        setServers((prev) =>
            prev.map((s) => (s.id === id ? { ...s, headers: s.headers.filter((_, i) => i !== idx) } : s)),
        );

    const testServer = async (s: McpServerItem) => {
        setTests((t) => ({ ...t, [s.id]: { status: "loading" } }));
        try {
            const res = await fetch("/api/admin/mcp/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: s.url, transport: s.transport, headers: s.headers, name: s.name }),
            });
            const data = await res.json();
            if (data.ok) {
                setTests((t) => ({
                    ...t,
                    [s.id]: { status: "ok", message: `Connected — ${data.toolCount} tool(s): ${data.toolNames.slice(0, 8).join(", ")}${data.toolNames.length > 8 ? "…" : ""}` },
                }));
            } else {
                setTests((t) => ({ ...t, [s.id]: { status: "error", message: data.error || "Connection failed" } }));
            }
        } catch (err) {
            setTests((t) => ({ ...t, [s.id]: { status: "error", message: String(err) } }));
        }
    };

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-white flex items-center gap-2">
                        <Plug size={18} /> MCP Servers
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                        Connect Model Context Protocol servers (GitHub, Slack, databases, …). Their tools become
                        selectable per chat. Remote HTTP &amp; SSE transports only.
                    </p>
                </div>
            </div>

            <form action={action} className="space-y-4">
                <input type="hidden" name="mcpServers" value={JSON.stringify(servers)} />

                <div className="space-y-3">
                    {servers.length === 0 && (
                        <p className="text-sm text-gray-500 italic">No MCP servers configured yet.</p>
                    )}

                    {servers.map((s) => {
                        const isOpen = expanded === s.id;
                        const test = tests[s.id];
                        return (
                            <div key={s.id} className="border border-gray-700 rounded-lg bg-gray-800/40">
                                <div className="flex items-center gap-2 p-3">
                                    <button
                                        type="button"
                                        onClick={() => setExpanded(isOpen ? null : s.id)}
                                        className="text-gray-400 hover:text-white shrink-0"
                                    >
                                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-gray-200 truncate">
                                            {s.name || <span className="text-gray-500 italic">Unnamed server</span>}
                                        </div>
                                        <div className="text-xs text-gray-500 truncate">{s.url || "no URL"}</div>
                                    </div>
                                    <span className="text-[10px] uppercase tracking-wider text-gray-500 px-2 py-0.5 rounded bg-gray-700/60 shrink-0">
                                        {s.transport}
                                    </span>
                                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                        <input
                                            type="checkbox"
                                            checked={s.enabled}
                                            onChange={(e) => update(s.id, { enabled: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => remove(s.id)}
                                        className="text-gray-500 hover:text-red-400 shrink-0"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>

                                {isOpen && (
                                    <div className="px-4 pb-4 space-y-3 border-t border-gray-700/60 pt-3">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-xs text-gray-400">Name</label>
                                                <input
                                                    value={s.name}
                                                    onChange={(e) => update(s.id, { name: e.target.value })}
                                                    placeholder="GitHub"
                                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs text-gray-400">Transport</label>
                                                <select
                                                    value={s.transport}
                                                    onChange={(e) => update(s.id, { transport: e.target.value as "http" | "sse" })}
                                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                                                >
                                                    <option value="http">Streamable HTTP</option>
                                                    <option value="sse">SSE</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-xs text-gray-400">Server URL</label>
                                            <input
                                                value={s.url}
                                                onChange={(e) => update(s.id, { url: e.target.value })}
                                                placeholder="https://example.com/mcp"
                                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500 font-mono"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-xs text-gray-400">Description (shown to users)</label>
                                            <input
                                                value={s.description}
                                                onChange={(e) => update(s.id, { description: e.target.value })}
                                                placeholder="Search repos, issues, PRs"
                                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs text-gray-400">Headers (e.g. Authorization)</label>
                                                <button
                                                    type="button"
                                                    onClick={() => addHeader(s.id)}
                                                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                                >
                                                    <Plus size={12} /> Add header
                                                </button>
                                            </div>
                                            {s.headers.map((h, idx) => (
                                                <div key={idx} className="flex gap-2">
                                                    <input
                                                        value={h.key}
                                                        onChange={(e) => updateHeader(s.id, idx, { key: e.target.value })}
                                                        placeholder="Authorization"
                                                        className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-blue-500 font-mono"
                                                    />
                                                    <input
                                                        value={h.value}
                                                        onChange={(e) => updateHeader(s.id, idx, { value: e.target.value })}
                                                        placeholder="Bearer token…"
                                                        type="password"
                                                        className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-blue-500 font-mono"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeHeader(s.id, idx)}
                                                        className="text-gray-500 hover:text-red-400 px-1"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex items-center gap-3 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => testServer(s)}
                                                disabled={!s.url || test?.status === "loading"}
                                                className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                            >
                                                {test?.status === "loading" ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
                                                Test connection
                                            </button>
                                            {test?.status === "ok" && (
                                                <span className="text-xs text-green-400 flex items-center gap-1">
                                                    <CheckCircle2 size={13} /> {test.message}
                                                </span>
                                            )}
                                            {test?.status === "error" && (
                                                <span className="text-xs text-red-400 flex items-center gap-1">
                                                    <XCircle size={13} /> {test.message}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <button
                    type="button"
                    onClick={add}
                    className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
                >
                    <Plus size={15} /> Add MCP server
                </button>

                {result && (
                    <p className={`text-sm ${result.ok ? "text-green-400" : "text-red-400"}`}>{result.message}</p>
                )}

                <button
                    type="submit"
                    disabled={isPending}
                    className="block px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isPending ? "Saving…" : "Save MCP Servers"}
                </button>
            </form>
        </div>
    );
}
