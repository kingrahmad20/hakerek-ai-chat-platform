import { logger } from "@/lib/logger";

/**
 * Server-side voice helpers: speech-to-text (Whisper) and text-to-speech.
 *
 * The OpenAI path (Whisper transcription + OpenAI TTS) reuses the existing
 * `providerApiKeys.openai` key (and optional `openaiBaseUrl`) configured in the
 * admin dashboard, so no extra credentials are required to enable it. ElevenLabs
 * is supported as an alternative TTS provider via its own key.
 *
 * All calls go through plain `fetch` against provider REST endpoints — no new
 * npm dependencies. Settings are the source of truth (read from the `Setting`
 * table by the route handlers and passed in here).
 */

export type TtsProvider = "openai" | "elevenlabs";

export interface VoiceConfig {
    sttEnabled: boolean;
    sttModel: string;
    /** ISO-639-1 language hint for Whisper, or "" for auto-detect. */
    sttLanguage: string;
    ttsEnabled: boolean;
    ttsProvider: TtsProvider;
    ttsModel: string;
    ttsVoice: string;
    openaiKey: string;
    openaiBaseUrl: string;
    elevenLabsKey: string;
    elevenLabsVoiceId: string;
    elevenLabsModelId: string;
}

type VoiceError = { error: string; status: number };

/** Build a VoiceConfig from a settings lookup function. */
export function readVoiceConfig(getSetting: (key: string) => string | undefined): VoiceConfig {
    let openaiKey = "";
    let openaiBaseUrl = "";
    try {
        const pk = JSON.parse(getSetting("providerApiKeys") || "{}");
        openaiKey = typeof pk.openai === "string" ? pk.openai : "";
        openaiBaseUrl = typeof pk.openaiBaseUrl === "string" ? pk.openaiBaseUrl : "";
    } catch { /* ignore malformed JSON */ }

    return {
        sttEnabled: getSetting("sttEnabled") === "true",
        sttModel: getSetting("sttModel") || "whisper-1",
        sttLanguage: (getSetting("sttLanguage") || "").trim(),
        ttsEnabled: getSetting("ttsEnabled") === "true",
        ttsProvider: getSetting("ttsProvider") === "elevenlabs" ? "elevenlabs" : "openai",
        ttsModel: getSetting("ttsModel") || "tts-1",
        ttsVoice: getSetting("ttsVoice") || "alloy",
        openaiKey,
        openaiBaseUrl,
        elevenLabsKey: getSetting("elevenLabsApiKey") || "",
        elevenLabsVoiceId: getSetting("elevenLabsVoiceId") || "21m00Tcm4TlvDq8ikWAM",
        elevenLabsModelId: getSetting("elevenLabsModelId") || "eleven_multilingual_v2",
    };
}

function openaiBase(cfg: VoiceConfig): string {
    const base = cfg.openaiBaseUrl?.trim() || "https://api.openai.com/v1";
    return base.replace(/\/+$/, "");
}

/** Transcribe an audio blob via the OpenAI-compatible Whisper endpoint. */
export async function transcribeAudio(
    audio: Blob,
    filename: string,
    cfg: VoiceConfig,
): Promise<{ text: string } | VoiceError> {
    if (!cfg.openaiKey) {
        return { error: "Transcription is not configured (missing OpenAI API key).", status: 500 };
    }

    const form = new FormData();
    form.append("file", audio, filename);
    form.append("model", cfg.sttModel);
    if (cfg.sttLanguage) form.append("language", cfg.sttLanguage);

    let res: Response;
    try {
        res = await fetch(`${openaiBase(cfg)}/audio/transcriptions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${cfg.openaiKey}` },
            body: form,
        });
    } catch (err) {
        logger.error("stt_request_failed", { error: String(err) });
        return { error: "Could not reach the transcription service.", status: 502 };
    }

    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        logger.error("stt_failed", { status: res.status, error: errText.slice(0, 500) });
        return { error: "Transcription failed. Please try again.", status: 502 };
    }

    const data = await res.json().catch(() => ({}));
    return { text: typeof data.text === "string" ? data.text : "" };
}

/** Synthesize speech for the given text. Returns MP3 audio bytes. */
export async function synthesizeSpeech(
    text: string,
    cfg: VoiceConfig,
): Promise<{ audio: ArrayBuffer; contentType: string } | VoiceError> {
    if (cfg.ttsProvider === "elevenlabs") {
        if (!cfg.elevenLabsKey) {
            return { error: "Read aloud is not configured (missing ElevenLabs API key).", status: 500 };
        }
        let res: Response;
        try {
            res = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cfg.elevenLabsVoiceId)}`,
                {
                    method: "POST",
                    headers: {
                        "xi-api-key": cfg.elevenLabsKey,
                        "Content-Type": "application/json",
                        Accept: "audio/mpeg",
                    },
                    body: JSON.stringify({ text, model_id: cfg.elevenLabsModelId }),
                },
            );
        } catch (err) {
            logger.error("tts_request_failed", { provider: "elevenlabs", error: String(err) });
            return { error: "Could not reach the speech service.", status: 502 };
        }
        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            logger.error("tts_failed", { provider: "elevenlabs", status: res.status, error: errText.slice(0, 500) });
            return { error: "Speech synthesis failed. Please try again.", status: 502 };
        }
        return { audio: await res.arrayBuffer(), contentType: "audio/mpeg" };
    }

    // OpenAI (default)
    if (!cfg.openaiKey) {
        return { error: "Read aloud is not configured (missing OpenAI API key).", status: 500 };
    }
    let res: Response;
    try {
        res = await fetch(`${openaiBase(cfg)}/audio/speech`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${cfg.openaiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: cfg.ttsModel,
                voice: cfg.ttsVoice,
                input: text,
                response_format: "mp3",
            }),
        });
    } catch (err) {
        logger.error("tts_request_failed", { provider: "openai", error: String(err) });
        return { error: "Could not reach the speech service.", status: 502 };
    }
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        logger.error("tts_failed", { provider: "openai", status: res.status, error: errText.slice(0, 500) });
        return { error: "Speech synthesis failed. Please try again.", status: 502 };
    }
    return { audio: await res.arrayBuffer(), contentType: "audio/mpeg" };
}
