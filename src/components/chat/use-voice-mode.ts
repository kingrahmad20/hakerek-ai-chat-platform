/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hands-free conversational voice mode (streaming pipeline).
 *
 * Runs a duplex loop on top of the existing chat infrastructure: client-side
 * VAD segments the user's speech → `/api/transcribe` (Whisper) → the message is
 * pushed through the *existing* `useChat` `sendMessage` (so it persists and runs
 * the full RAG/tools/memory/persona pipeline) → the assistant reply is spoken
 * back sentence-by-sentence via `/api/tts` as it streams. Barge-in: if the user
 * starts talking while the assistant is speaking, playback + the in-flight LLM
 * stream are cancelled and a new turn begins.
 *
 * No new dependencies and no new providers — reuses `/api/transcribe`,
 * `/api/tts`, and the chat transport already wired up in `chat-window.tsx`.
 */

export type VoiceState =
    | "idle"
    | "listening"
    | "transcribing"
    | "thinking"
    | "speaking"
    | "error";

interface UseVoiceModeArgs {
    /** Whether voice mode is active (overlay open). */
    active: boolean;
    /** `status` from `useChat` ("submitted" | "streaming" | "ready" | "error"). */
    status: string;
    /** `messages` from `useChat`. */
    messages: any[];
    /** `sendMessage` from `useChat` — same path typed messages use. */
    sendMessage: (msg: any) => void;
    /** `stop` from `useChat` — aborts the in-flight stream (for barge-in). */
    stop: () => void;
    /** Extract clean assistant text from a message (chat-window's getMessageText). */
    getMessageText: (m: any) => string;
    /** Server TTS (Whisper/provider) available — otherwise fall back to browser. */
    serverTtsEnabled: boolean;
    /** Browser speechSynthesis available (fallback TTS). */
    ttsSupported: boolean;
}

interface UseVoiceModeReturn {
    state: VoiceState;
    muted: boolean;
    toggleMute: () => void;
    /** Live mic amplitude 0..1 for orb animation. */
    amplitude: number;
    /** Last user transcript / current spoken sentence (caption). */
    caption: string;
    error: string | null;
}

// ── Tuning constants ────────────────────────────────────────────────────────
const ONSET_FRAMES = 3;          // consecutive loud frames to treat as speech start
const SILENCE_MS = 800;          // trailing silence that ends an utterance
const MIN_UTTERANCE_MS = 350;    // ignore blips shorter than this
const MAX_UTTERANCE_MS = 30_000; // hard cap on a single turn
const BARGE_FRAMES = 5;          // sustained loud frames to interrupt playback
const ONSET_MULT = 2.2;          // onset threshold = noiseFloor * mult
const BARGE_MULT = 3.0;          // barge-in needs a stronger signal (echo guard)
const MIN_THRESHOLD = 0.012;     // absolute floor so a silent room can't self-trigger

/** Strip markdown so synthesized speech doesn't read "asterisk asterisk". */
function cleanForSpeech(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, " ")            // code fences
        .replace(/`([^`]+)`/g, "$1")                 // inline code
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")       // images
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")     // links → label
        .replace(/[*_#>~|]/g, " ")                    // md punctuation
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Pull complete sentences out of `full` starting at `fromIdx`. Returns the
 * sentences found and the new cursor (left at the start of the trailing,
 * not-yet-complete fragment).
 */
function extractSentences(full: string, fromIdx: number): { sentences: string[]; newIdx: number } {
    const rest = full.slice(fromIdx);
    const sentences: string[] = [];
    let consumed = 0;
    const re = /[^.!?\n]*[.!?\n]+(?:["')\]]+)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rest)) !== null) {
        const chunk = m[0];
        consumed = m.index + chunk.length;
        const cleaned = cleanForSpeech(chunk);
        if (cleaned) sentences.push(cleaned);
    }
    return { sentences, newIdx: fromIdx + consumed };
}

export function useVoiceMode(args: UseVoiceModeArgs): UseVoiceModeReturn {
    const { active, status, messages, sendMessage, stop, getMessageText, serverTtsEnabled, ttsSupported } = args;

    const [state, setState] = useState<VoiceState>("idle");
    const [muted, setMuted] = useState(false);
    const [amplitude, setAmplitude] = useState(0);
    const [caption, setCaption] = useState("");
    const [error, setError] = useState<string | null>(null);

    // Mirror reactive values into refs so the rAF loop / async callbacks read fresh values.
    const stateRef = useRef<VoiceState>("idle");
    const mutedRef = useRef(false);
    useEffect(() => { stateRef.current = state; }, [state]);
    useEffect(() => { mutedRef.current = muted; }, [muted]);

    // Audio engine refs
    const streamRef = useRef<MediaStream | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataRef = useRef<Uint8Array | null>(null);
    const rafRef = useRef<number | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    // VAD bookkeeping
    const noiseFloorRef = useRef(0.01);
    const capturingRef = useRef(false);
    const onsetCountRef = useRef(0);
    const bargeCountRef = useRef(0);
    const speechStartRef = useRef(0);
    const lastVoiceRef = useRef(0);
    const ampUiCounterRef = useRef(0);

    // Indirection refs so self-recursive callbacks don't reference themselves
    // before declaration (and always see fresh values).
    const pumpQueueRef = useRef<() => void>(() => {});
    const tickRef = useRef<() => void>(() => {});

    // TTS playback refs
    const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
    const ttsQueueRef = useRef<string[]>([]);
    const ttsPlayingRef = useRef(false);
    const spokenCursorRef = useRef(0);
    const currentAssistantIdRef = useRef<string | null>(null);
    const streamDoneRef = useRef(false);
    const turnActiveRef = useRef(false); // a user turn has been submitted & not yet fully answered

    const setStateSafe = useCallback((s: VoiceState) => {
        stateRef.current = s;
        setState(s);
    }, []);

    // ── TTS playback ─────────────────────────────────────────────────────────
    const stopPlayback = useCallback(() => {
        ttsQueueRef.current = [];
        ttsPlayingRef.current = false;
        const a = ttsAudioRef.current;
        if (a) {
            a.onended = null;
            a.onerror = null;
            a.pause();
            if (a.src) { try { URL.revokeObjectURL(a.src); } catch { /* ignore */ } }
            a.src = "";
            ttsAudioRef.current = null;
        }
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
            window.speechSynthesis.cancel();
        }
    }, []);

    const resumeListening = useCallback(() => {
        turnActiveRef.current = false;
        streamDoneRef.current = false;
        if (stateRef.current !== "error") setStateSafe("listening");
    }, [setStateSafe]);

    // Pump the sentence queue: synthesize + play one item at a time.
    const pumpQueue = useCallback(async () => {
        if (ttsPlayingRef.current) return;
        const next = ttsQueueRef.current.shift();
        if (next === undefined) {
            // Nothing queued. If the stream finished, the turn is over.
            if (streamDoneRef.current) resumeListening();
            return;
        }
        ttsPlayingRef.current = true;
        setStateSafe("speaking");
        setCaption(next);

        const onDone = () => {
            ttsPlayingRef.current = false;
            pumpQueueRef.current();
        };

        // Browser fallback when server TTS isn't configured.
        if (!serverTtsEnabled) {
            if (ttsSupported) {
                const u = new SpeechSynthesisUtterance(next);
                u.onend = onDone;
                u.onerror = onDone;
                window.speechSynthesis.speak(u);
            } else {
                onDone();
            }
            return;
        }

        try {
            const res = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: next }),
            });
            if (!res.ok) throw new Error("tts failed");
            // The user may have interrupted while we waited.
            if (!ttsPlayingRef.current) return;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            ttsAudioRef.current = audio;
            audio.onended = onDone;
            audio.onerror = onDone;
            await audio.play();
        } catch {
            onDone();
        }
    }, [serverTtsEnabled, ttsSupported, setStateSafe, resumeListening]);
    useEffect(() => { pumpQueueRef.current = () => { void pumpQueue(); }; }, [pumpQueue]);

    const enqueueSentences = useCallback((sentences: string[]) => {
        if (sentences.length === 0) return;
        ttsQueueRef.current.push(...sentences);
        void pumpQueue();
    }, [pumpQueue]);

    // ── Capture (MediaRecorder) ──────────────────────────────────────────────
    const transcribe = useCallback(async (blob: Blob, ext: string) => {
        setStateSafe("transcribing");
        try {
            const fd = new FormData();
            fd.append("audio", blob, `recording.${ext}`);
            const res = await fetch("/api/transcribe", { method: "POST", body: fd });
            if (!res.ok) throw new Error("transcribe failed");
            const data = await res.json();
            const text = typeof data.text === "string" ? data.text.trim() : "";
            if (!text) { resumeListening(); return; }
            setCaption(text);
            // Hand off to the existing chat pipeline; persistence comes for free.
            turnActiveRef.current = true;
            streamDoneRef.current = false;
            spokenCursorRef.current = 0;
            currentAssistantIdRef.current = null;
            setStateSafe("thinking");
            sendMessage({ role: "user", parts: [{ type: "text", text }] });
        } catch {
            resumeListening();
        }
    }, [sendMessage, setStateSafe, resumeListening]);

    const stopCapture = useCallback(() => {
        capturingRef.current = false;
        const rec = recorderRef.current;
        if (rec && rec.state !== "inactive") rec.stop();
    }, []);

    const startCapture = useCallback(() => {
        const stream = streamRef.current;
        if (!stream || capturingRef.current) return;
        let recorder: MediaRecorder;
        try {
            recorder = new MediaRecorder(stream);
        } catch {
            return;
        }
        chunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.onstop = () => {
            const chunks = chunksRef.current;
            chunksRef.current = [];
            const mime = recorder.mimeType || "audio/webm";
            const blob = new Blob(chunks, { type: mime });
            const elapsed = performance.now() - speechStartRef.current;
            if (blob.size === 0 || elapsed < MIN_UTTERANCE_MS) { resumeListening(); return; }
            const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "mp4" : mime.includes("wav") ? "wav" : "webm";
            void transcribe(blob, ext);
        };
        recorderRef.current = recorder;
        recorder.start();
        capturingRef.current = true;
        speechStartRef.current = performance.now();
        lastVoiceRef.current = performance.now();
    }, [transcribe, resumeListening]);

    // Barge-in: cancel playback + the in-flight stream, then capture a new turn.
    const interrupt = useCallback(() => {
        stopPlayback();
        try { stop(); } catch { /* ignore */ }
        streamDoneRef.current = false;
        turnActiveRef.current = false;
        setStateSafe("listening");
        startCapture();
    }, [stopPlayback, stop, setStateSafe, startCapture]);

    // ── VAD loop ─────────────────────────────────────────────────────────────
    const tick = useCallback(() => {
        rafRef.current = requestAnimationFrame(() => tickRef.current());
        const analyser = analyserRef.current;
        const data = dataRef.current;
        if (!analyser || !data) return;

        analyser.getByteTimeDomainData(data as any);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);

        // Throttled amplitude for the UI orb (~15fps).
        if ((ampUiCounterRef.current = (ampUiCounterRef.current + 1) % 4) === 0) {
            setAmplitude(Math.min(1, rms * 6));
        }

        if (mutedRef.current) { onsetCountRef.current = 0; bargeCountRef.current = 0; return; }

        const st = stateRef.current;
        const onsetThreshold = Math.max(MIN_THRESHOLD, noiseFloorRef.current * ONSET_MULT);
        const bargeThreshold = Math.max(MIN_THRESHOLD * 2, noiseFloorRef.current * BARGE_MULT);
        const now = performance.now();

        if (capturingRef.current) {
            // Segment the current utterance by trailing silence.
            if (rms > onsetThreshold) {
                lastVoiceRef.current = now;
            }
            if (now - lastVoiceRef.current > SILENCE_MS || now - speechStartRef.current > MAX_UTTERANCE_MS) {
                stopCapture();
            }
            return;
        }

        if (st === "listening") {
            if (rms > onsetThreshold) {
                if (++onsetCountRef.current >= ONSET_FRAMES) {
                    onsetCountRef.current = 0;
                    startCapture();
                }
            } else {
                onsetCountRef.current = 0;
                // Slowly adapt the noise floor while idle.
                noiseFloorRef.current = noiseFloorRef.current * 0.95 + rms * 0.05;
            }
        } else if (st === "speaking") {
            // Barge-in detection (echo-guarded by a higher threshold).
            if (rms > bargeThreshold) {
                if (++bargeCountRef.current >= BARGE_FRAMES) {
                    bargeCountRef.current = 0;
                    interrupt();
                }
            } else {
                bargeCountRef.current = 0;
            }
        } else {
            onsetCountRef.current = 0;
            bargeCountRef.current = 0;
        }
    }, [startCapture, stopCapture, interrupt]);
    useEffect(() => { tickRef.current = tick; }, [tick]);

    // ── Lifecycle: open / close ──────────────────────────────────────────────
    useEffect(() => {
        if (!active) return;
        let cancelled = false;

        (async () => {
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
            } catch {
                if (!cancelled) { setError("Microphone access denied."); setStateSafe("error"); }
                return;
            }
            if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

            streamRef.current = stream;
            const Ctx: typeof AudioContext =
                window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new Ctx();
            audioCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            source.connect(analyser);
            analyserRef.current = analyser;
            dataRef.current = new Uint8Array(analyser.fftSize);
            noiseFloorRef.current = 0.01;

            setStateSafe("listening");
            rafRef.current = requestAnimationFrame(tick);
        })();

        return () => {
            cancelled = true;
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            stopPlayback();
            try {
                if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
            } catch { /* ignore */ }
            recorderRef.current = null;
            capturingRef.current = false;
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            audioCtxRef.current?.close().catch(() => {});
            audioCtxRef.current = null;
            analyserRef.current = null;
            dataRef.current = null;
            setStateSafe("idle");
            setAmplitude(0);
            setCaption("");
            setError(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    // ── React to chat status / streaming output → drive TTS ──────────────────
    useEffect(() => {
        if (!active || !turnActiveRef.current) return;

        const lastAssistant = [...messages].reverse().find((m) => m?.role === "assistant");
        if (lastAssistant) {
            const id = lastAssistant.id ?? null;
            if (id !== currentAssistantIdRef.current) {
                currentAssistantIdRef.current = id;
                spokenCursorRef.current = 0;
            }
            const full = getMessageText(lastAssistant) || "";
            const { sentences, newIdx } = extractSentences(full, spokenCursorRef.current);
            if (sentences.length > 0) {
                spokenCursorRef.current = newIdx;
                enqueueSentences(sentences);
            }

            // Stream finished: flush the trailing fragment and mark done.
            if (status !== "streaming" && status !== "submitted") {
                const tail = cleanForSpeech(full.slice(spokenCursorRef.current));
                spokenCursorRef.current = full.length;
                streamDoneRef.current = true;
                if (tail) enqueueSentences([tail]);
                else if (!ttsPlayingRef.current && ttsQueueRef.current.length === 0) resumeListening();
            }
        } else if (status !== "streaming" && status !== "submitted") {
            // No assistant message produced (e.g. error) — go back to listening.
            resumeListening();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, status, active]);

    const toggleMute = useCallback(() => {
        setMuted((m) => {
            const next = !m;
            if (next && capturingRef.current) stopCapture();
            return next;
        });
    }, [stopCapture]);

    return { state, muted, toggleMute, amplitude, caption, error };
}
