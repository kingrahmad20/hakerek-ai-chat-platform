import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { generateImage, DEFAULT_IMAGE_MODEL } from "@/lib/image-gen";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return new Response("Unauthorized", { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
        body = await req.json();
    } catch {
        return new Response("Invalid request body", { status: 400 });
    }

    const { prompt, chatId } = body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return new Response("prompt is required", { status: 400 });
    }

    const settings = await prisma.setting.findMany();
    const getSetting = (key: string) =>
        settings.find((s: { key: string; value: string }) => s.key === key)?.value;

    let apiKey: string | undefined;
    const apiKeysRaw = getSetting("apiKeys");
    if (apiKeysRaw) {
        try {
            const keys: { key: string; active: boolean }[] = JSON.parse(apiKeysRaw);
            apiKey = keys.find((k) => k.active)?.key;
        } catch { /* fall through */ }
    }
    if (!apiKey) apiKey = getSetting("openRouterApiKey");

    if (!apiKey) {
        return new Response("API key not configured", { status: 500 });
    }

    const imageModel = getSetting("imageGenerationModel") || DEFAULT_IMAGE_MODEL;

    try {
        const result = await generateImage(prompt, apiKey, imageModel);

        if (!result.ok) {
            logger.error("image_generation_failed", {
                userId: session.user.id,
                status: result.status,
                error: result.error,
            });
            return new Response("Image generation failed. Please try again.", { status: 502 });
        }

        const { dataUrl, revisedPrompt } = result;

        const assistantContent = JSON.stringify({
            type: "generated_image",
            text: revisedPrompt,
            files: [dataUrl],
        });

        if (chatId) {
            const ownedChat = await prisma.chat.findFirst({ where: { id: chatId, deletedAt: null }, select: { userId: true } });
            if (!ownedChat || ownedChat.userId !== session.user.id) {
                return new Response("Forbidden", { status: 403 });
            }

            await prisma.message.create({
                data: { chatId, role: "user", content: prompt.trim() },
            });
            await prisma.message.create({
                data: { chatId, role: "assistant", content: assistantContent },
            });
            await prisma.chat.update({
                where: { id: chatId },
                data: { updatedAt: new Date() },
            });

            // Auto-title new chats
            const chat = await prisma.chat.findUnique({
                where: { id: chatId },
                select: { title: true, _count: { select: { messages: true } } },
            });
            if (chat?.title === "New Chat" && (chat._count.messages ?? 0) <= 3) {
                await prisma.chat.update({
                    where: { id: chatId },
                    data: { title: `Image: ${prompt.trim().slice(0, 50)}` },
                });
            }
        }

        logger.info("image_generation_success", {
            userId: session.user.id,
            chatId,
            model: imageModel,
        });

        return Response.json({ imageUrl: dataUrl, revisedPrompt });
    } catch (error) {
        logger.error("image_generation_error", {
            userId: session.user.id,
            error: String(error),
        });
        return new Response("Image generation failed. Please try again.", { status: 500 });
    }
}
