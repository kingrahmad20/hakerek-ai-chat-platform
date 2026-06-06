import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { readVoiceConfig, synthesizeSpeech } from "@/lib/voice";

export const dynamic = "force-dynamic";

const MAX_TTS_CHARS = 4096; // OpenAI per-request input cap

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return new Response("Unauthorized", { status: 401 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return new Response("Invalid request body", { status: 400 });
    }

    const rawText =
        body && typeof body === "object" && typeof (body as { text?: unknown }).text === "string"
            ? (body as { text: string }).text
            : "";
    const text = rawText.trim();
    if (!text) {
        return new Response("text is required", { status: 400 });
    }

    const settings = await prisma.setting.findMany();
    const getSetting = (key: string) =>
        settings.find((s: { key: string; value: string }) => s.key === key)?.value;
    const cfg = readVoiceConfig(getSetting);

    if (!cfg.ttsEnabled) {
        return new Response("Read aloud is not enabled.", { status: 403 });
    }

    const result = await synthesizeSpeech(text.slice(0, MAX_TTS_CHARS), cfg);
    if ("error" in result) {
        return new Response(result.error, { status: result.status });
    }

    logger.info("tts_success", { userId: session.user.id, provider: cfg.ttsProvider, chars: text.length });
    return new Response(result.audio, {
        headers: {
            "Content-Type": result.contentType,
            "Cache-Control": "no-store",
        },
    });
}
