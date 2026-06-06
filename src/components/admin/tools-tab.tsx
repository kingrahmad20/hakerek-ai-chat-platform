"use client";

import { useActionState, useState } from "react";
import { saveToolSettings, type McpServerItem } from "@/app/admin/actions";
import { Wrench, Globe, Calculator, Clock, Link, ImagePlus } from "lucide-react";
import { McpServersManager } from "@/components/admin/mcp-servers";

const ALL_TOOLS = [
    { id: "web_search", label: "Web Search", description: "Search the web for current information", icon: <Globe size={16} /> },
    { id: "calculator", label: "Calculator", description: "Evaluate mathematical expressions", icon: <Calculator size={16} /> },
    { id: "datetime", label: "Date & Time", description: "Get current date/time in any timezone", icon: <Clock size={16} /> },
    { id: "url_fetch", label: "Fetch URL", description: "Read the content of a web page", icon: <Link size={16} /> },
    { id: "generate_image", label: "Generate Image", description: "Create an image from a text description mid-conversation", icon: <ImagePlus size={16} /> },
];

const SEARCH_PROVIDERS = [
    { id: "serper", label: "Serper (Google Search)", url: "https://serper.dev" },
    { id: "brave", label: "Brave Search", url: "https://brave.com/search/api/" },
    { id: "tavily", label: "Tavily AI Search", url: "https://tavily.com" },
];

interface Props {
    toolsEnabled: boolean;
    searchProvider: string;
    searchApiKey: string;
    allowedTools: string[];
    mcpServers: McpServerItem[];
}

export function ToolsTab({ toolsEnabled, searchProvider, searchApiKey, allowedTools, mcpServers }: Props) {
    const [result, action, isPending] = useActionState(saveToolSettings, null);

    const [enabled, setEnabled] = useState(toolsEnabled);
    const [provider, setProvider] = useState(searchProvider || "serper");
    const [allowedSet, setAllowedSet] = useState<Set<string>>(new Set(allowedTools));

    const toggleTool = (id: string) => {
        setAllowedSet((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="max-w-2xl space-y-6">
            <form action={action} className="space-y-6">
                {/* Global toggle */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-semibold text-white flex items-center gap-2">
                                <Wrench size={18} /> Agent / Tool Use Mode
                            </h2>
                            <p className="text-sm text-gray-400 mt-1">
                                Let users give the AI tools to use during a conversation.
                            </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                name="toolsEnabled"
                                checked={enabled}
                                onChange={(e) => setEnabled(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                        </label>
                    </div>
                </div>

                {/* Available tools */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                    <h3 className="font-semibold text-white">Available Tools</h3>
                    <p className="text-xs text-gray-400">Choose which tools users can enable in chat.</p>
                    <div className="space-y-3">
                        {ALL_TOOLS.map((t) => (
                            <label
                                key={t.id}
                                className="flex items-start gap-3 cursor-pointer group"
                            >
                                <input
                                    type="checkbox"
                                    name="toolAllowedList"
                                    value={t.id}
                                    checked={allowedSet.has(t.id)}
                                    onChange={() => toggleTool(t.id)}
                                    className="mt-0.5 accent-blue-500"
                                />
                                <div>
                                    <div className="flex items-center gap-2 text-sm font-medium text-gray-200 group-hover:text-white">
                                        {t.icon} {t.label}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Search provider config */}
                {allowedSet.has("web_search") && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                        <h3 className="font-semibold text-white">Web Search Configuration</h3>
                        <p className="text-xs text-gray-400">
                            Required to enable the Web Search tool. Web search will be hidden from users if no API key is set.
                        </p>

                        <div className="space-y-1">
                            <label className="text-sm text-gray-400">Search Provider</label>
                            <select
                                name="toolSearchProvider"
                                value={provider}
                                onChange={(e) => setProvider(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                            >
                                {SEARCH_PROVIDERS.map((p) => (
                                    <option key={p.id} value={p.id}>{p.label}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-600">
                                Get an API key at{" "}
                                <span className="text-blue-400">
                                    {SEARCH_PROVIDERS.find((p) => p.id === provider)?.url}
                                </span>
                            </p>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm text-gray-400">API Key</label>
                            <input
                                type="password"
                                name="toolSearchApiKey"
                                defaultValue={searchApiKey}
                                placeholder="sk-..."
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500 font-mono"
                            />
                        </div>
                    </div>
                )}

                {result && (
                    <p className={`text-sm ${result.ok ? "text-green-400" : "text-red-400"}`}>
                        {result.message}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={isPending}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isPending ? "Saving…" : "Save Tool Settings"}
                </button>
            </form>

            <McpServersManager servers={mcpServers} />
        </div>
    );
}
