import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateText } from "ai";
import { createAIModel } from "@/lib/ai-providers";

export const dynamic = "force-dynamic";

async function canAccess(chatId: string, userId: string, isAdmin: boolean): Promise<boolean> {
    const chat = await prisma.chat.findFirst({
        where: { id: chatId, deletedAt: null },
        select: { userId: true, workspaceFolderId: true },
    });
    if (!chat) return false;
    if (chat.userId === userId || isAdmin) return true;
    if (!chat.workspaceFolderId) return false;

    const folder = await prisma.workspaceFolder.findUnique({
        where: { id: chat.workspaceFolderId },
        select: { workspaceId: true },
    });
    if (!folder) return false;
    const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: folder.workspaceId, userId } },
    });
    return !!member;
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ chatId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chatId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    const allowed = await canAccess(chatId, userId, isAdmin);
    if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        select: { summary: true, summaryUpdatedAt: true },
    });
    if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ summary: chat.summary, summaryUpdatedAt: chat.summaryUpdatedAt });
}

export async function POST(
    _req: Request,
    { params }: { params: Promise<{ chatId: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chatId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    const allowed = await canAccess(chatId, userId, isAdmin);
    if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: {
            messages: {
                where: { parentMessageId: null, role: { in: ["user", "assistant"] } },
                orderBy: { createdAt: "asc" },
                select: { role: true, content: true },
            },
        },
    });
    if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (chat.messages.length < 4) {
        return NextResponse.json({ error: "Not enough messages to summarize" }, { status: 400 });
    }

    const settings = await prisma.setting.findMany();
    const getSetting = (key: string) => settings.find((s: { key: string; value: string }) => s.key === key)?.value;

    let apiKey: string | undefined;
    const apiKeysRaw = getSetting("apiKeys");
    if (apiKeysRaw) {
        try {
            const keys: { key: string; active: boolean }[] = JSON.parse(apiKeysRaw);
            apiKey = keys.find((k) => k.active)?.key;
        } catch { /* fall through */ }
    }
    if (!apiKey) apiKey = getSetting("openRouterApiKey");
    if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

    const model = getSetting("defaultModel") || "openrouter/auto";

    const providerApiKeys = (() => {
        try { return JSON.parse(getSetting("providerApiKeys") || "{}"); } catch { return {}; }
    })();

    const transcript = chat.messages
        .map((m) => {
            let text = m.content;
            try {
                const parsed = JSON.parse(m.content);
                if (parsed && typeof parsed === "object" && "text" in parsed) text = parsed.text ?? "";
            } catch { /* plain text */ }
            return `${m.role === "user" ? "User" : "Assistant"}: ${text}`;
        })
        .join("\n\n");

    const { text: summary } = await generateText({
        model: createAIModel(model, apiKey, providerApiKeys),
        prompt: `Summarize the following conversation in one concise paragraph (3-5 sentences). Focus on the main topics discussed, key decisions made, and important conclusions. Do not start with "The conversation" — start directly with the substance.\n\n${transcript}`,
        maxOutputTokens: 300,
    });

    const now = new Date();
    await prisma.chat.update({
        where: { id: chatId },
        data: { summary: summary.trim(), summaryUpdatedAt: now },
    });

    return NextResponse.json({ summary: summary.trim(), summaryUpdatedAt: now });
}
