import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateText } from "ai";
import { createAIModel, parseModelId } from "@/lib/ai-providers";

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
    if (chat.messages.length < 2) {
        return NextResponse.json({ error: "Not enough messages to extract action items" }, { status: 400 });
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

    const model = getSetting("defaultModel") || "openrouter/auto";
    const providerApiKeys = (() => {
        try { return JSON.parse(getSetting("providerApiKeys") || "{}"); } catch { return {}; }
    })();

    if (!apiKey && parseModelId(model).provider === "openrouter") {
        return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

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

    const prompt = `You are an assistant that extracts action items and decisions from conversations.

Given the conversation below, extract:
- **Tasks**: concrete actions someone needs to do (e.g. "Send the report by Friday", "Set up a meeting")
- **Decisions**: choices or agreements that were made (e.g. "Decided to use PostgreSQL", "Agreed to launch on Q3")

Return ONLY a valid JSON array with no extra text. Each element must have:
  "text": string (the action item or decision, concise, starts with a verb)
  "type": "task" | "decision"

If there are no action items, return an empty array [].

Conversation:
${transcript}`;

    const { text: raw } = await generateText({
        model: createAIModel(model, apiKey ?? "", providerApiKeys),
        prompt,
        maxOutputTokens: 600,
    });

    let extracted: { text: string; type: "task" | "decision" }[] = [];
    try {
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed)) {
                extracted = parsed
                    .filter((item) => typeof item.text === "string" && (item.type === "task" || item.type === "decision"))
                    .map((item) => ({ text: item.text.trim(), type: item.type }));
            }
        }
    } catch { /* return empty */ }

    return NextResponse.json({ items: extracted });
}
