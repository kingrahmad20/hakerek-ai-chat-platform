/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect } from "react";
import { Mic, MicOff, X, Loader2 } from "lucide-react";
import { useVoiceMode, type VoiceState } from "./use-voice-mode";

interface VoiceModeOverlayProps {
    status: string;
    messages: any[];
    sendMessage: (msg: any) => void;
    stop: () => void;
    getMessageText: (m: any) => string;
    serverTtsEnabled: boolean;
    ttsSupported: boolean;
    onClose: () => void;
}

const STATE_LABEL: Record<VoiceState, string> = {
    idle: "Starting…",
    listening: "Listening…",
    transcribing: "Transcribing…",
    thinking: "Thinking…",
    speaking: "Speaking…",
    error: "Voice mode unavailable",
};

export function VoiceModeOverlay({
    status,
    messages,
    sendMessage,
    stop,
    getMessageText,
    serverTtsEnabled,
    ttsSupported,
    onClose,
}: VoiceModeOverlayProps) {
    const { state, muted, toggleMute, amplitude, caption, error } = useVoiceMode({
        active: true,
        status,
        messages,
        sendMessage,
        stop,
        getMessageText,
        serverTtsEnabled,
        ttsSupported,
    });

    // Esc closes voice mode.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const label = error ?? STATE_LABEL[state];
    const orbScale =
        state === "listening" && !muted ? 1 + Math.min(0.6, amplitude * 0.6) : 1;
    const ring =
        state === "speaking" ? "ring-emerald-400/60"
            : state === "thinking" ? "ring-blue-400/50"
                : state === "error" ? "ring-red-500/50"
                    : "ring-blue-500/40";

    return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gray-950/95 backdrop-blur-sm">
            {/* Close (top-right) */}
            <button
                onClick={onClose}
                title="Exit voice mode (Esc)"
                className="absolute top-5 right-5 p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
                <X size={22} />
            </button>

            {/* Orb */}
            <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
                <div
                    className={`absolute rounded-full bg-gradient-to-br from-blue-500/30 to-emerald-500/20 ring-4 ${ring} transition-transform duration-100 motion-reduce:transition-none ${state === "speaking" ? "animate-pulse" : ""}`}
                    style={{
                        width: 180,
                        height: 180,
                        transform: `scale(${orbScale})`,
                    }}
                />
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gray-900/80 border border-gray-700 shadow-xl">
                    {state === "thinking" || state === "transcribing" ? (
                        <Loader2 size={34} className="animate-spin text-blue-300 motion-reduce:animate-none" />
                    ) : muted ? (
                        <MicOff size={34} className="text-gray-400" />
                    ) : (
                        <Mic size={34} className={state === "error" ? "text-red-400" : "text-blue-200"} />
                    )}
                </div>
            </div>

            {/* Status + caption */}
            <p className="mt-8 text-lg font-medium text-gray-100">{label}</p>
            {caption && !error && (
                <p className="mt-3 max-w-xl px-6 text-center text-sm text-gray-400 line-clamp-3">
                    {caption}
                </p>
            )}

            {/* Controls */}
            <div className="mt-10 flex items-center gap-4">
                <button
                    onClick={toggleMute}
                    disabled={state === "error"}
                    title={muted ? "Unmute microphone" : "Mute microphone"}
                    className={`flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-colors disabled:opacity-40 ${muted ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-blue-600 text-white hover:bg-blue-500"}`}
                >
                    {muted ? <MicOff size={18} /> : <Mic size={18} />}
                    {muted ? "Muted" : "Mute"}
                </button>
                <button
                    onClick={onClose}
                    title="End voice conversation"
                    className="flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-medium text-white hover:bg-red-500 transition-colors"
                >
                    <X size={18} /> End
                </button>
            </div>

            <p className="mt-6 text-xs text-gray-600">
                {error ? "Check microphone permissions and voice settings." : "Just speak — pause when you're done. Talk over the reply to interrupt."}
            </p>
        </div>
    );
}
