import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Pull plain text out of a stored Message.content (string | {text} | {parts}). */
function extractText(content: string): string {
    try {
        const parsed = JSON.parse(content);
        if (typeof parsed === "string") return parsed;
        if (parsed && typeof parsed.text === "string") return parsed.text;
        if (Array.isArray(parsed?.parts)) {
            return parsed.parts
                .filter((p: { type?: string; text?: string }) => p?.type === "text" && p.text)
                .map((p: { text: string }) => p.text)
                .join("\n");
        }
        if (Array.isArray(parsed)) {
            return parsed
                .filter((p: { type?: string; text?: string }) => p?.type === "text" && p.text)
                .map((p: { text: string }) => p.text)
                .join("\n");
        }
    } catch {
        /* not JSON — fall through to raw content */
    }
    return content;
}

// GET — suggest eval cases seeded from the user prompts behind the most
// downvoted assistant responses, so a regression suite can be built from real
// failures instead of guesswork. Returns candidate prompts only (no expected).
export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limit = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "20")));

    // Most thumbs-down'd assistant messages.
    const downvoted = await prisma.messageReaction.groupBy({
        by: ["messageId"],
        where: { type: "thumbs_down" },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: limit,
    });
    if (downvoted.length === 0) return NextResponse.json({ candidates: [] });

    const messages = await prisma.message.findMany({
        where: { id: { in: downvoted.map((d) => d.messageId) } },
        select: { id: true, chatId: true, role: true, createdAt: true, model: true },
    });
    const msgMap = new Map(messages.map((m) => [m.id, m]));

    // For each downvoted assistant message, the prompt is the latest user
    // message that preceded it in the same chat.
    const candidates: { prompt: string; downvotes: number; model: string | null }[] = [];
    const seen = new Set<string>();

    for (const d of downvoted) {
        const assistant = msgMap.get(d.messageId);
        if (!assistant) continue;

        const userMsg = await prisma.message.findFirst({
            where: {
                chatId: assistant.chatId,
                role: "user",
                createdAt: { lt: assistant.createdAt },
            },
            orderBy: { createdAt: "desc" },
            select: { content: true },
        });
        if (!userMsg) continue;

        const prompt = extractText(userMsg.content).trim().slice(0, 8000);
        if (!prompt) continue;

        const dedupKey = prompt.slice(0, 200).toLowerCase();
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        candidates.push({ prompt, downvotes: d._count.id, model: assistant.model });
    }

    return NextResponse.json({ candidates });
}
