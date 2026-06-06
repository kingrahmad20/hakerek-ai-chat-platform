"use client";

import { useActionState, useState } from "react";
import { Code2, Globe, Bot, Palette, MessageSquare, Zap, Copy, Check } from "lucide-react";
import { saveWidgetSettings } from "@/app/admin/actions";
import { useToast } from "@/components/providers/toast-provider";

interface Props {
    widgetEnabled: boolean;
    widgetTitle: string;
    widgetColor: string;
    widgetPosition: string;
    widgetBotName: string;
    widgetWelcomeMessage: string;
    widgetSystemPrompt: string;
    widgetRateLimitPerHour: string;
    baseUrl: string;
}

export function WidgetTab({
    widgetEnabled,
    widgetTitle,
    widgetColor,
    widgetPosition,
    widgetBotName,
    widgetWelcomeMessage,
    widgetSystemPrompt,
    widgetRateLimitPerHour,
    baseUrl,
}: Props) {
    const { toast } = useToast();
    const [state, formAction, pending] = useActionState(saveWidgetSettings, null);

    const [enabled, setEnabled] = useState(widgetEnabled);
    const [color, setColor] = useState(widgetColor || "#3B82F6");
    const [copied, setCopied] = useState(false);

    const embedCode = `<script src="${baseUrl}/widget.js" async></script>`;

    const handleCopy = () => {
        navigator.clipboard.writeText(embedCode).then(() => {
            setCopied(true);
            toast?.("Copied to clipboard!", "success");
            setTimeout(() => setCopied(false), 2000);
        });
    };

    // Show toast on save result
    const prevStateRef = { current: state };
    if (state && state !== prevStateRef.current) {
        prevStateRef.current = state;
    }

    return (
        <div className="space-y-8 max-w-2xl">
            {state && (
                <div
                    className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                        state.ok
                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}
                >
                    {state.message}
                </div>
            )}

            <form action={formAction} className="space-y-6">
                {/* Status */}
                <div className="bg-gray-900 rounded-xl p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Globe size={18} className="text-blue-400" />
                        <h3 className="font-semibold">Widget Status</h3>
                    </div>
                    <label className="flex items-center justify-between cursor-pointer gap-4">
                        <div>
                            <div className="text-sm font-medium">Enable Embeddable Widget</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                                Allow external websites to embed your chat assistant
                            </div>
                        </div>
                        <div className="relative shrink-0">
                            <input
                                type="checkbox"
                                name="widgetEnabled"
                                id="widgetEnabled"
                                defaultChecked={widgetEnabled}
                                onChange={(e) => setEnabled(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 rounded-full bg-gray-600 peer-checked:bg-blue-600 transition-colors duration-200 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:w-5 after:h-5 after:shadow-sm after:transition-transform after:duration-200 peer-checked:after:translate-x-5" />
                        </div>
                    </label>
                </div>

                {/* Appearance */}
                <div className="bg-gray-900 rounded-xl p-6 space-y-5">
                    <div className="flex items-center gap-2 mb-1">
                        <Palette size={18} className="text-purple-400" />
                        <h3 className="font-semibold">Appearance</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                                Widget Title
                            </label>
                            <input
                                name="widgetTitle"
                                defaultValue={widgetTitle || "Chat with Us"}
                                maxLength={100}
                                placeholder="Chat with Us"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                                Bot Name
                            </label>
                            <input
                                name="widgetBotName"
                                defaultValue={widgetBotName || "Assistant"}
                                maxLength={60}
                                placeholder="Assistant"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                                Accent Color
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    name="widgetColor"
                                    value={color}
                                    onChange={(e) => setColor(e.target.value)}
                                    className="w-10 h-10 rounded-lg border border-gray-700 bg-gray-800 cursor-pointer p-0.5"
                                />
                                <input
                                    type="text"
                                    value={color}
                                    onChange={(e) => setColor(e.target.value)}
                                    maxLength={7}
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                                Position
                            </label>
                            <select
                                name="widgetPosition"
                                defaultValue={widgetPosition || "bottom-right"}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
                            >
                                <option value="bottom-right">Bottom Right</option>
                                <option value="bottom-left">Bottom Left</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Behavior */}
                <div className="bg-gray-900 rounded-xl p-6 space-y-5">
                    <div className="flex items-center gap-2 mb-1">
                        <Bot size={18} className="text-green-400" />
                        <h3 className="font-semibold">Behavior</h3>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                            Welcome Message
                        </label>
                        <textarea
                            name="widgetWelcomeMessage"
                            defaultValue={widgetWelcomeMessage}
                            maxLength={300}
                            rows={2}
                            placeholder="Hi! How can I help you today?"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors resize-none"
                        />
                        <div className="text-xs text-gray-500">
                            Shown before the first message is sent
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                            Custom System Prompt
                        </label>
                        <textarea
                            name="widgetSystemPrompt"
                            defaultValue={widgetSystemPrompt}
                            maxLength={2000}
                            rows={4}
                            placeholder="You are a helpful assistant for this website. Be concise and friendly."
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors resize-none font-mono"
                        />
                        <div className="text-xs text-gray-500">
                            Applied to every widget conversation (in addition to global AI Rules)
                        </div>
                    </div>
                </div>

                {/* Rate Limiting */}
                <div className="bg-gray-900 rounded-xl p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Zap size={18} className="text-yellow-400" />
                        <h3 className="font-semibold">Rate Limiting</h3>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                            Max Messages per IP per Hour
                        </label>
                        <input
                            type="number"
                            name="widgetRateLimitPerHour"
                            defaultValue={widgetRateLimitPerHour || "20"}
                            min={0}
                            max={1000}
                            className="w-full sm:w-48 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
                        />
                        <div className="text-xs text-gray-500">
                            Set to 0 to disable rate limiting (not recommended)
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={pending}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                    {pending ? "Saving…" : "Save Widget Settings"}
                </button>
            </form>

            {/* Embed Code */}
            <div className="bg-gray-900 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <Code2 size={18} className="text-orange-400" />
                    <h3 className="font-semibold">Embed Code</h3>
                </div>

                {!enabled ? (
                    <p className="text-sm text-gray-400">
                        Enable the widget above and save to get your embed code.
                    </p>
                ) : (
                    <>
                        <p className="text-sm text-gray-400">
                            Paste this snippet into your website&apos;s HTML, just before the{" "}
                            <code className="text-gray-300 bg-gray-800 px-1 py-0.5 rounded text-xs">&lt;/body&gt;</code>{" "}
                            tag:
                        </p>
                        <div className="relative">
                            <pre className="bg-gray-950 border border-gray-800 p-4 rounded-lg text-sm text-green-400 overflow-x-auto whitespace-pre-wrap break-all">
                                {embedCode}
                            </pre>
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="absolute top-2 right-2 p-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                                title="Copy to clipboard"
                            >
                                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                            </button>
                        </div>

                        <div className="text-xs text-gray-500 space-y-1">
                            <div className="flex items-start gap-2">
                                <MessageSquare size={12} className="mt-0.5 shrink-0 text-gray-500" />
                                <span>
                                    Widget sessions are stateless — conversations are not saved to the database.
                                </span>
                            </div>
                            <div className="flex items-start gap-2">
                                <Globe size={12} className="mt-0.5 shrink-0 text-gray-500" />
                                <span>
                                    The widget loads your chat at <code className="bg-gray-800 px-1 rounded">{baseUrl}/widget</code> inside an iframe.
                                </span>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
