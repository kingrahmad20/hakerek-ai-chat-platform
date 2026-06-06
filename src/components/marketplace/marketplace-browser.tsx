"use client";
import { useEffect, useState, useCallback } from "react";
import { Theater, Terminal, Database, Search, Loader2, Download, Store } from "lucide-react";
import { ImportButton } from "@/components/marketplace/import-button";
import type { MarketplaceItemSummary, MarketplaceItemType } from "@/types";

type TypeFilter = "all" | MarketplaceItemType;
type Scope = "public" | "workspace" | "mine";

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "persona", label: "Assistants" },
    { key: "slash_command", label: "Commands" },
    { key: "knowledge_base", label: "Knowledge" },
];

const SCOPE_TABS: { key: Scope; label: string }[] = [
    { key: "public", label: "Public" },
    { key: "workspace", label: "My Workspaces" },
    { key: "mine", label: "Published by me" },
];

const TYPE_ICON: Record<MarketplaceItemType, React.ReactNode> = {
    persona: <Theater size={15} className="text-violet-400" />,
    slash_command: <Terminal size={15} className="text-amber-400" />,
    knowledge_base: <Database size={15} className="text-sky-400" />,
};

export function MarketplaceBrowser() {
    const [type, setType] = useState<TypeFilter>("all");
    const [scope, setScope] = useState<Scope>("public");
    const [q, setQ] = useState("");
    const [items, setItems] = useState<MarketplaceItemSummary[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams({ scope });
        if (type !== "all") params.set("type", type);
        if (q.trim()) params.set("q", q.trim());
        try {
            const res = await fetch(`/api/marketplace?${params.toString()}`);
            setItems(res.ok ? await res.json() : []);
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [type, scope, q]);

    // Debounce search; immediate on tab change.
    useEffect(() => {
        const t = setTimeout(load, q ? 300 : 0);
        return () => clearTimeout(t);
    }, [load, q]);

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-xl font-bold flex items-center gap-2"><Store size={22} className="text-blue-400" /> Marketplace</h1>
                <p className="text-sm text-gray-400 mt-1">Discover and import assistants, slash commands, and knowledge bases shared by the community.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {SCOPE_TABS.map((s) => (
                    <button key={s.key} onClick={() => setScope(s.key)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${scope === s.key ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
                        {s.label}
                    </button>
                ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="flex flex-wrap gap-1.5">
                    {TYPE_TABS.map((t) => (
                        <button key={t.key} onClick={() => setType(t.key)}
                            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${type === t.key ? "border-blue-500 text-blue-300 bg-blue-900/20" : "border-gray-700 text-gray-400 hover:bg-gray-800"}`}>
                            {t.label}
                        </button>
                    ))}
                </div>
                <div className="relative sm:ml-auto sm:w-64">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
                        className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-gray-500"><Loader2 size={22} className="animate-spin" /></div>
            ) : items.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                    <Store size={36} className="text-gray-700 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Nothing here yet.</p>
                    <p className="text-xs text-gray-600 mt-1">Publish from your <a href="/library" className="text-blue-400 hover:underline">library</a> to seed the marketplace.</p>
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((it) => (
                        <div key={it.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                {TYPE_ICON[it.type]}
                                <span className="capitalize">{it.type.replace("_", " ")}</span>
                                {it.visibility !== "public" && <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">{it.visibility}</span>}
                            </div>
                            <a href={`/m/${it.shareToken}`} className="block mt-2 font-semibold text-white hover:text-blue-300 transition-colors truncate">{it.name}</a>
                            {it.description && <p className="text-sm text-gray-400 mt-1 line-clamp-2 leading-relaxed">{it.description}</p>}
                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-3">
                                <span>by {it.authorName || "a user"}</span>
                                <span className="flex items-center gap-1"><Download size={12} /> {it.installCount}</span>
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-800">
                                <ImportButton token={it.shareToken} type={it.type} imported={it.imported} mine={it.mine} className="w-full" />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
