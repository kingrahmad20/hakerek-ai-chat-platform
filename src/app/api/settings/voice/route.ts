import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readVoiceConfig } from "@/lib/voice";

export const dynamic = "force-dynamic";

/**
 * Tells the chat client whether server-side voice (Whisper STT / provider TTS)
 * is available. A feature is only advertised as enabled when both its toggle is
 * on *and* the required API key is actually configured — otherwise the client
 * falls back to the browser Web Speech API.
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const settings = await prisma.setting.findMany({
        where: {
            key: {
                in: ["sttEnabled", "ttsEnabled", "ttsProvider", "providerApiKeys", "elevenLabsApiKey"],
            },
        },
    });
    const getSetting = (key: string) =>
        settings.find((s: { key: string; value: string }) => s.key === key)?.value;
    const cfg = readVoiceConfig(getSetting);

    const sttEnabled = cfg.sttEnabled && !!cfg.openaiKey;
    const ttsEnabled =
        cfg.ttsEnabled &&
        (cfg.ttsProvider === "elevenlabs" ? !!cfg.elevenLabsKey : !!cfg.openaiKey);

    return NextResponse.json({ sttEnabled, ttsEnabled });
}
