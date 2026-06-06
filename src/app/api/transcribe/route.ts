import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { readVoiceConfig, transcribeAudio } from "@/lib/voice";

export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Whisper hard limit

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return new Response("Unauthorized", { status: 401 });
    }

    const settings = await prisma.setting.findMany();
    const getSetting = (key: string) =>
        settings.find((s: { key: string; value: string }) => s.key === key)?.value;
    const cfg = readVoiceConfig(getSetting);

    if (!cfg.sttEnabled) {
        return new Response("Voice input is not enabled.", { status: 403 });
    }

    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        return new Response("Invalid form data", { status: 400 });
    }

    const audio = form.get("audio");
    if (!(audio instanceof Blob)) {
        return new Response("audio file is required", { status: 400 });
    }
    if (audio.size === 0) {
        return new Response("audio file is empty", { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
        return new Response("audio file too large (max 25MB)", { status: 413 });
    }

    const filename = (audio instanceof File && audio.name) ? audio.name : "recording.webm";
    const result = await transcribeAudio(audio, filename, cfg);
    if ("error" in result) {
        return new Response(result.error, { status: result.status });
    }

    logger.info("stt_success", { userId: session.user.id, bytes: audio.size });
    return Response.json({ text: result.text });
}
