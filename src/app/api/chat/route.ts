/* eslint-disable @typescript-eslint/no-explicit-any */
import { streamText, generateText } from "ai";
import { createAIModel, parseModelId, type ProviderApiKeys } from "@/lib/ai-providers";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { dispatchWebhook } from "@/lib/webhook";
import { extractAndSaveMemories, getUserMemoriesForPrompt } from "@/lib/memory";
import { searchKnowledgeBases, embedAndSaveMessage } from "@/lib/rag";
import { buildTools, type ToolName, type SearchProvider } from "@/lib/agent-tools";
import { parseMcpServers, buildMcpTools, MCP_TOOL_PREFIX } from "@/lib/mcp";
import { canAccessChat } from "@/lib/chat-access";
import { checkChatBudget, recordWorkspaceSpendAndAlert } from "@/lib/budget";
import { publish } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const VALID_ROLES = new Set(["user", "assistant"]);
const MAX_MESSAGES = 100;
const MAX_TEXT_LENGTH = 32_000;

function extractText(msg: any): string {
    // Check parts first, but fall through to content if parts yields nothing
    if (Array.isArray(msg.parts)) {
        const fromParts = msg.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("");
        if (fromParts) return fromParts;
    }
    if (typeof msg.content === "string") {
        try {
            const parsed = JSON.parse(msg.content);
            if (parsed && typeof parsed === "object" && "text" in parsed) return parsed.text ?? "";
        } catch { /* plain text */ }
        return msg.content;
    }
    return "";
}

function extractImageUrls(msg: any): string[] {
    if (Array.isArray(msg.parts)) {
        return msg.parts
            .filter((p: any) => p.type === "file" && typeof p.url === "string")
            .map((p: any) => p.url as string);
    }
    return [];
}

function dataUrlToBase64(dataUrl: string): { base64: string; mimeType: string } | null {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { mimeType: match[1], base64: match[2] };
}

function buildLLMContent(msg: any): string | any[] {
    // Use content-first for text (matches original behaviour), fall back to parts text
    let text: string;
    if (typeof msg.content === "string" && msg.content !== "") {
        try {
            const parsed = JSON.parse(msg.content);
            text = (parsed && typeof parsed === "object" && "text" in parsed) ? (parsed.text ?? "") : msg.content;
        } catch {
            text = msg.content;
        }
    } else {
        text = Array.isArray(msg.parts)
            ? msg.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
            : "";
    }

    const imageUrls = extractImageUrls(msg);
    if (imageUrls.length === 0) return text;

    const parts: any[] = [{ type: "text", text: text || " " }];
    for (const url of imageUrls) {
        const parsed = dataUrlToBase64(url);
        if (parsed) {
            if (parsed.mimeType === "application/pdf") {
                parts.push({ type: "file", data: parsed.base64, mimeType: "application/pdf" });
            } else {
                parts.push({ type: "image", image: parsed.base64, mimeType: parsed.mimeType });
            }
        }
    }
    return parts;
}

function validateMessages(messages: any): string | null {
    if (!Array.isArray(messages) || messages.length === 0)
        return "messages must be a non-empty array";
    if (messages.length > MAX_MESSAGES)
        return `maximum ${MAX_MESSAGES} messages per request`;
    for (const msg of messages) {
        if (!msg || typeof msg !== "object")
            return "each message must be an object";
        if (!VALID_ROLES.has(msg.role))
            return `invalid role: ${msg.role}`;
        const text = extractText(msg);
        if (text.length > MAX_TEXT_LENGTH)
            return `message too long (max ${MAX_TEXT_LENGTH} characters)`;
    }
    return null;
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return new Response("Unauthorized", { status: 401 });
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return new Response("Invalid request body", { status: 400 });
    }

    const { messages, chatId, files, selectedModel, knowledgeBaseIds, enabledTools, parentMessageId, personaId, incognito } = body;
    // Incognito chats are never persisted and read no stored memory. Persistence is
    // already gated on `chatId` (null for incognito); this flag additionally skips
    // injecting the user's saved memories into the prompt.
    const isIncognito = incognito === true;
    let activeKbIds: string[] = Array.isArray(knowledgeBaseIds)
        ? knowledgeBaseIds.filter((id: any) => typeof id === "string")
        : [];
    let requestedTools: ToolName[] = Array.isArray(enabledTools)
        ? (enabledTools.filter((t: unknown) => typeof t === "string") as ToolName[])
        : [];
    // MCP servers are requested via picker ids of the form "mcp:<serverId>".
    let requestedMcpServerIds: string[] = Array.isArray(enabledTools)
        ? enabledTools
              .filter((t: unknown): t is string => typeof t === "string" && t.startsWith(MCP_TOOL_PREFIX))
              .map((t: string) => t.slice(MCP_TOOL_PREFIX.length))
        : [];
    const attachedFiles: string[] = Array.isArray(files)
        ? files.filter((f: any) => typeof f === "string" && (
            f.startsWith("data:image/") || f.startsWith("data:application/pdf")
          ))
        : [];

    const validationError = validateMessages(messages);
    if (validationError) {
        return new Response(validationError, { status: 400 });
    }

    const settings = await prisma.setting.findMany();
    const getSetting = (key: string) => settings.find((s: { key: string; value: string }) => s.key === key)?.value;

    // Resolve the active custom assistant ("persona"). Beyond a system prompt, an
    // assistant can bind its own model, knowledge bases, and tool list — applied below.
    type ActivePersona = {
        id: string;
        enabled: boolean;
        systemPrompt?: string;
        model?: string;
        knowledgeBaseIds?: string[];
        toolIds?: string[];
    };
    let activePersona: ActivePersona | null = null;
    // Admin-curated personas (global Setting) are trusted; user-owned personas
    // (from the personal library / marketplace imports) are NOT — their model
    // binding must respect the multi-model allow-list (see below).
    let personaIsUserOwned = false;
    if (personaId && typeof personaId === "string") {
        const personasRaw = getSetting("personas");
        if (personasRaw) {
            try {
                const personas: ActivePersona[] = JSON.parse(personasRaw);
                activePersona = personas.find((p) => p.id === personaId && p.enabled) ?? null;
            } catch { /* ignore */ }
        }
        // Fall back to the requester's own library personas. Ownership is enforced
        // by scoping the lookup to session.user.id.
        if (!activePersona && session) {
            const libItem = await prisma.userLibraryItem.findFirst({
                where: { id: personaId, userId: session.user.id, type: "persona", enabled: true },
                select: { data: true },
            });
            if (libItem) {
                try {
                    const data = JSON.parse(libItem.data);
                    activePersona = { id: personaId, enabled: true, ...data };
                    personaIsUserOwned = true;
                } catch { /* ignore */ }
            }
        }
    }

    // The assistant's bound knowledge bases are always searched while it is active,
    // in addition to any the user attached manually.
    if (activePersona?.knowledgeBaseIds?.length) {
        activeKbIds = Array.from(new Set([...activeKbIds, ...activePersona.knowledgeBaseIds]));
    }

    // An assistant with an explicit tool list dictates which tools are available,
    // overriding the client picker. An empty array means "no tools".
    if (activePersona && Array.isArray(activePersona.toolIds)) {
        requestedTools = activePersona.toolIds.filter(
            (t): t is ToolName => typeof t === "string" && !t.startsWith(MCP_TOOL_PREFIX)
        );
        requestedMcpServerIds = activePersona.toolIds
            .filter((t): t is string => typeof t === "string" && t.startsWith(MCP_TOOL_PREFIX))
            .map((t) => t.slice(MCP_TOOL_PREFIX.length));
    }

    // Prefer active key from multi-key store; fall back to legacy single key
    let apiKey: string | undefined;
    const apiKeysRaw = getSetting("apiKeys");
    if (apiKeysRaw) {
        try {
            const keys: { key: string; active: boolean }[] = JSON.parse(apiKeysRaw);
            apiKey = keys.find((k) => k.active)?.key;
        } catch { /* fall through */ }
    }
    if (!apiKey) apiKey = getSetting("openRouterApiKey");

    const defaultModel = getSetting("defaultModel") || "openrouter/auto";
    const fallbackModels = getSetting("fallbackModels") || "";

    // Allow user-selected model if multi-model feature is enabled
    let primaryModel = defaultModel;
    if (selectedModel && typeof selectedModel === "string" && session) {
        const multiModelEnabled = getSetting("multiModelEnabled") === "true";
        const allowedIds = (getSetting("allowedModels") || "").split(",").filter(Boolean);
        if (multiModelEnabled && allowedIds.includes(selectedModel.trim())) {
            primaryModel = selectedModel.trim();
        }
    }

    // An admin-curated assistant's bound model overrides both the platform default
    // and any user selection (bypassing the multi-model allow-list gate). A
    // user-owned persona's model is untrusted, so it only applies when it passes
    // the same allow-list a manual model selection would.
    if (activePersona?.model) {
        if (!personaIsUserOwned) {
            primaryModel = activePersona.model;
        } else {
            const multiModelEnabled = getSetting("multiModelEnabled") === "true";
            const allowedIds = (getSetting("allowedModels") || "").split(",").map((s) => s.trim()).filter(Boolean);
            if (multiModelEnabled && allowedIds.includes(activePersona.model.trim())) {
                primaryModel = activePersona.model.trim();
            }
        }
    }

    // Read per-provider API keys
    const providerApiKeys: ProviderApiKeys = (() => {
        try { return JSON.parse(getSetting("providerApiKeys") || "{}"); } catch { return {}; }
    })();

    if (!apiKey) {
        // Only block if the primary model actually routes through OpenRouter.
        // Non-OpenRouter providers (openai, anthropic, deepseek, qwen) use their
        // own key from providerApiKeys and never touch the OpenRouter key.
        const { provider: primaryProvider } = parseModelId(primaryModel);
        const hasProviderKey = primaryProvider !== "openrouter" &&
            !!providerApiKeys[primaryProvider as keyof ProviderApiKeys];
        if (!hasProviderKey) {
            logger.warn("chat_no_api_key", { userId: session?.user.id, provider: primaryProvider });
            return new Response("API Key not configured", { status: 500 });
        }
    }

    let messagesForLLM = messages.map((msg: any) => ({
        role: msg.role,
        content: buildLLMContent(msg),
    }));

    // Build system message: AI rules (all users) + persona + user system prompt (logged-in only)
    const systemParts: string[] = [];

    const aiRulesRaw = getSetting("aiRules");
    if (aiRulesRaw) {
        try {
            const rules: { title: string; content: string; enabled: boolean }[] = JSON.parse(aiRulesRaw);
            const active = rules.filter(r => r.enabled);
            if (active.length > 0) {
                systemParts.push(
                    "Follow these rules before responding to any question:\n" +
                    active.map((r, i) => `${i + 1}. [${r.title}] ${r.content}`).join("\n")
                );
            }
        } catch { /* ignore */ }
    }

    // Inject the active assistant's system prompt (resolved above).
    if (activePersona?.systemPrompt) {
        systemParts.push(activePersona.systemPrompt);
    }

    if (session) {
        // Rate limiting
        const rateLimit = parseInt(getSetting("rateLimitPerDay") || "0");
        if (rateLimit > 0) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const usageCount = await prisma.message.count({
                where: {
                    role: "user",
                    createdAt: { gte: today },
                    authorId: session.user.id,
                },
            });
            if (usageCount >= rateLimit) {
                logger.warn("chat_rate_limited", { userId: session.user.id, usageCount, rateLimit });
                return new Response(
                    `Daily usage limit (${rateLimit} messages) reached. Please try again tomorrow.`,
                    { status: 429 }
                );
            }
        }

        // User system prompt + quota fields
        const dbUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { systemPrompt: true, monthlyMessageQuota: true, monthlyTokenQuota: true },
        }).catch(() => prisma.user.findUnique({
            where: { id: session.user.id },
            select: { systemPrompt: true },
        }));

        // Per-user monthly quota enforcement
        if ((dbUser as any)?.monthlyMessageQuota != null || (dbUser as any)?.monthlyTokenQuota != null) {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

            const quota = dbUser as any;
            if (quota.monthlyMessageQuota != null) {
                const monthlyMsgCount = await prisma.message.count({
                    where: { role: "user", createdAt: { gte: monthStart }, authorId: session.user.id },
                });
                if (monthlyMsgCount >= quota.monthlyMessageQuota) {
                    logger.warn("chat_monthly_msg_quota_exceeded", { userId: session.user.id, monthlyMsgCount, quota: quota.monthlyMessageQuota });
                    return new Response(
                        `Monthly message limit (${quota.monthlyMessageQuota}) reached. Please upgrade your plan or wait until next month.`,
                        { status: 429 }
                    );
                }
            }

            if (quota.monthlyTokenQuota != null) {
                const tokenAgg = await prisma.usageLog.aggregate({
                    where: { userId: session.user.id, createdAt: { gte: monthStart } },
                    _sum: { inputTokens: true, outputTokens: true },
                });
                const totalTokens = (tokenAgg._sum.inputTokens ?? 0) + (tokenAgg._sum.outputTokens ?? 0);
                if (totalTokens >= quota.monthlyTokenQuota) {
                    logger.warn("chat_monthly_token_quota_exceeded", { userId: session.user.id, totalTokens, quota: quota.monthlyTokenQuota });
                    return new Response(
                        `Monthly token limit (${quota.monthlyTokenQuota.toLocaleString()}) reached. Please upgrade your plan or wait until next month.`,
                        { status: 429 }
                    );
                }
            }
        }

        if (dbUser?.systemPrompt) {
            systemParts.push(dbUser.systemPrompt);
        }

        if (!isIncognito) {
            const memoriesBlock = await getUserMemoriesForPrompt(session.user.id);
            if (memoriesBlock) {
                systemParts.push(memoriesBlock);
            }
        }

        // Inject relevant knowledge base context for the current query.
        // Only search knowledge bases the requester actually owns — the id list
        // can come from the client body or a (possibly imported) persona binding,
        // so it must be re-checked against ownership to avoid cross-user leakage.
        if (activeKbIds.length > 0) {
            const ownedKbs = await prisma.knowledgeBase.findMany({
                where: { id: { in: activeKbIds }, userId: session.user.id },
                select: { id: true },
            });
            activeKbIds = ownedKbs.map((k) => k.id);
        }
        if (activeKbIds.length > 0) {
            const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
            const queryText = lastUserMsg ? extractText(lastUserMsg) : "";
            if (queryText) {
                const cohereEnabled = getSetting("cohereEnabled") === "true";
                const cohereApiKey = cohereEnabled ? (getSetting("cohereApiKey") || undefined) : undefined;
                const kbContext = await searchKnowledgeBases(queryText, activeKbIds, apiKey ?? "", cohereApiKey).catch(() => "");
                if (kbContext) systemParts.push(kbContext);
            }
        }
    }

    if (systemParts.length > 0) {
        messagesForLLM = [
            { role: "system", content: systemParts.join("\n\n") },
            ...messagesForLLM,
        ];
    }

    // Workspace whose budget governs this chat (set during the pre-flight check
    // below) so the post-completion side-effects can recompute spend and alert.
    let budgetWorkspaceId: string | null = null;

    if (session && chatId && messages.length > 0) {
        // Owner, global admin, or workspace member of a collaborative chat may post.
        const isAdmin = session.user.role === "ADMIN";
        if (!(await canAccessChat(chatId, session.user.id, isAdmin))) {
            return new Response("Forbidden", { status: 403 });
        }

        // Per-workspace budget guardrail (hard stop at 100% of the monthly cap).
        // Must run before the stream opens — once streaming starts the HTTP
        // status is committed and can't be changed to 429.
        const budget = await checkChatBudget(chatId);
        if (budget) {
            budgetWorkspaceId = budget.workspaceId;
            if (budget.blocked) {
                logger.warn("chat_workspace_budget_exceeded", {
                    userId: session.user.id,
                    workspaceId: budget.workspaceId,
                    spendUsd: budget.spendUsd,
                    budgetUsd: budget.budgetUsd,
                });
                // Fire the 100% alert if the cap was just crossed and not yet notified.
                recordWorkspaceSpendAndAlert(budget.workspaceId).catch(() => {});
                return new Response(
                    `This workspace has reached its monthly budget of $${budget.budgetUsd.toFixed(2)} (≈$${budget.spendUsd.toFixed(2)} spent). New AI requests are paused until next month or until a workspace admin raises the cap.`,
                    { status: 429 }
                );
            }
        }

        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === "user") {
            const msgText = extractText(lastMsg);
            const msgFiles = extractImageUrls(lastMsg).length > 0
                ? extractImageUrls(lastMsg)
                : attachedFiles;
            const content = msgFiles.length > 0
                ? JSON.stringify({ text: msgText, files: msgFiles })
                : msgText;
            const [savedUserMsg] = await prisma.$transaction([
                prisma.message.create({ data: { chatId, role: "user", content, authorId: session.user.id, ...(parentMessageId ? { parentMessageId } : {}) } }),
                prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } }),
            ]);
            embedAndSaveMessage(savedUserMsg.id, msgText, apiKey ?? "").catch(() => {});

            // Broadcast the new user message to other viewers of a collaborative chat.
            publish(chatId, {
                type: "message",
                triggeredBy: session.user.id,
                message: {
                    id: savedUserMsg.id,
                    role: "user",
                    content,
                    authorId: session.user.id,
                    authorName: session.user.name ?? null,
                    authorImage: session.user.image ?? null,
                    createdAt: savedUserMsg.createdAt.toISOString(),
                },
            });
        }
    }


    // Build agent tools if requested
    const toolsEnabled = getSetting("toolsEnabled") === "true";
    const allowedToolsRaw = getSetting("toolAllowedList") || "web_search,calculator,datetime,url_fetch,generate_image";
    const allowedTools = allowedToolsRaw.split(",").filter(Boolean) as ToolName[];
    const searchApiKey = getSetting("toolSearchApiKey") || "";
    const searchProvider = (getSetting("toolSearchProvider") || "serper") as SearchProvider;
    const imageModel = getSetting("imageGenerationModel") || undefined;

    // Images produced by the generate_image tool are captured here (out-of-band
    // from the model) and streamed to the client as markdown images mid-response.
    const generatedImages: { dataUrl: string; revisedPrompt: string }[] = [];

    const activeTools: Record<string, any> =
        toolsEnabled && requestedTools.length > 0
            ? buildTools(requestedTools, {
                  searchApiKey,
                  searchProvider,
                  allowedTools,
                  imageApiKey: apiKey,
                  imageModel,
                  onImageGenerated: (img) => generatedImages.push(img),
              })
            : {};

    // Connect any requested MCP servers and merge their tools. Connections stay
    // open for the duration of the stream and are closed in the stream's finally.
    let closeMcp: () => Promise<void> = async () => {};
    if (toolsEnabled && requestedMcpServerIds.length > 0) {
        const mcpServers = parseMcpServers(getSetting("mcpServers")).filter(
            (s) => s.enabled && requestedMcpServerIds.includes(s.id),
        );
        if (mcpServers.length > 0) {
            try {
                const mcp = await buildMcpTools(mcpServers);
                Object.assign(activeTools, mcp.tools);
                closeMcp = mcp.close;
                logger.info("mcp_tools_loaded", {
                    userId: session?.user.id,
                    servers: mcpServers.length,
                    connected: mcp.connected,
                    toolCount: Object.keys(mcp.tools).length,
                    errors: mcp.errors.length,
                });
            } catch (err) {
                logger.warn("mcp_build_failed", { error: String(err) });
            }
        }
    }

    const hasTools = Object.keys(activeTools).length > 0;

    // --- Smart Context Compression ---
    // When conversation history grows large, summarize old messages so the LLM
    // stays within its context window without losing key context.
    const COMPRESSION_CHAR_THRESHOLD = 60_000; // ~15K tokens
    const COMPRESSION_KEEP_RECENT = 10;        // messages to leave uncompressed

    const contextCompressionEnabled = getSetting("contextCompressionEnabled") !== "false";
    if (contextCompressionEnabled) {
        const totalConversationChars = messages.reduce((sum: number, m: any) => sum + extractText(m).length, 0);
        if (totalConversationChars > COMPRESSION_CHAR_THRESHOLD && messages.length > COMPRESSION_KEEP_RECENT + 4) {
            const systemMsgs = messagesForLLM.filter((m: any) => m.role === "system");
            const convMsgs = messagesForLLM.filter((m: any) => m.role !== "system");
            const oldConvMsgs = convMsgs.slice(0, -COMPRESSION_KEEP_RECENT);
            const recentConvMsgs = convMsgs.slice(-COMPRESSION_KEEP_RECENT);

            if (oldConvMsgs.length > 0) {
                try {
                    let existingSummary: string | null = null;
                    if (chatId) {
                        const chatRecord = await prisma.chat.findUnique({
                            where: { id: chatId },
                            select: { summary: true },
                        });
                        existingSummary = chatRecord?.summary ?? null;
                    }

                    const historyText = oldConvMsgs
                        .map((m: any) => {
                            const text = typeof m.content === "string"
                                ? m.content
                                : Array.isArray(m.content)
                                    ? m.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
                                    : "";
                            return `${m.role.toUpperCase()}: ${text.slice(0, 2000)}`;
                        })
                        .join("\n\n");

                    const summaryUserPrompt = existingSummary
                        ? `Previous summary of earlier conversation:\n${existingSummary}\n\nAdditional messages to incorporate:\n${historyText}`
                        : `Conversation to summarize:\n${historyText}`;

                    const summaryResult = await generateText({
                        model: createAIModel(primaryModel, apiKey ?? "", providerApiKeys),
                        messages: [
                            {
                                role: "system" as const,
                                content: "You are a conversation summarizer. Create a concise summary that preserves key facts, decisions, user preferences, and context. Write in third person. Be brief but comprehensive.",
                            },
                            { role: "user" as const, content: summaryUserPrompt },
                        ],
                        maxOutputTokens: 600,
                    });

                    const newSummary = summaryResult.text.trim();
                    if (newSummary) {
                        if (chatId) {
                            prisma.chat.update({
                                where: { id: chatId },
                                data: { summary: newSummary, summaryUpdatedAt: new Date() },
                            }).catch(() => {});
                        }
                        messagesForLLM = [
                            ...systemMsgs,
                            { role: "system" as const, content: `[Earlier conversation — summarized]\n${newSummary}` },
                            ...recentConvMsgs,
                        ];
                        logger.info("context_compression_applied", {
                            chatId,
                            oldMsgCount: oldConvMsgs.length,
                            recentMsgCount: recentConvMsgs.length,
                            totalChars: totalConversationChars,
                        });
                    }
                } catch (err) {
                    logger.warn("context_compression_failed", { chatId, error: String(err) });
                }
            }
        }
    }

    const modelsToTry = [primaryModel, ...fallbackModels.split(",").filter((m: string) => m.trim() && m.trim() !== primaryModel)];

    // Stream text while properly trying fallback models.
    // The old approach returned result.toTextStreamResponse() immediately, which committed
    // a 200 OK before the actual model call happened — so errors during streaming were
    // never caught and fallback models were never tried.
    const encoder = new TextEncoder();
    const bodyStream = new ReadableStream({
        async start(controller) {
            let succeeded = false;

            // Tell other viewers of a collaborative chat that the AI is responding.
            if (session && chatId) {
                publish(chatId, { type: "assistant-start", triggeredBy: session.user.id });
            }

            try {
            for (const model of modelsToTry) {
                const trimmedModel = model.trim();
                let collectedText = "";
                let sentAnyChunk = false;

                try {
                    const result = streamText({
                        model: createAIModel(trimmedModel, apiKey ?? "", providerApiKeys),
                        messages: messagesForLLM,
                        ...(hasTools ? { tools: activeTools, maxSteps: 8 } : {}),
                    });

                    let emittedImages = 0;
                    for await (const part of result.fullStream) {
                        if (part.type === "text-delta") {
                            sentAnyChunk = true;
                            collectedText += part.text;
                            controller.enqueue(encoder.encode(part.text));
                        } else if (part.type === "tool-result" && part.toolName === "generate_image") {
                            // The generate_image tool delivers images out-of-band via the
                            // onImageGenerated sink. Emit any newly produced ones as markdown
                            // images so they render live and persist in the saved message.
                            while (emittedImages < generatedImages.length) {
                                const img = generatedImages[emittedImages++];
                                const alt = img.revisedPrompt.replace(/[\[\]\r\n]+/g, " ").trim();
                                const marker = `\n\n![${alt}](${img.dataUrl})\n\n`;
                                sentAnyChunk = true;
                                collectedText += marker;
                                controller.enqueue(encoder.encode(marker));
                            }
                        } else if (part.type === "error") {
                            // SDK v6 surfaces provider errors as stream parts, not exceptions.
                            // Re-throw so the catch block below can try the next fallback model.
                            throw part.error instanceof Error ? part.error : new Error(String(part.error));
                        }
                    }

                    // Stream finished — run all post-completion side-effects
                    const usageResult = await Promise.resolve(result.usage).catch(() => null);
                    const inputTokens = usageResult?.inputTokens ?? 0;
                    const outputTokens = usageResult?.outputTokens ?? 0;

                    logger.info("chat_completion", {
                        userId: session?.user.id ?? "guest",
                        chatId,
                        model: trimmedModel,
                        inputTokens,
                        outputTokens,
                    });

                    if (session && chatId) {
                        const [assistantMsg] = await Promise.all([
                            prisma.message.create({ data: { chatId, role: "assistant", content: collectedText, model: trimmedModel, ...(parentMessageId ? { parentMessageId } : {}) } }),
                            prisma.usageLog.create({
                                data: { userId: session.user.id, chatId, model: trimmedModel, inputTokens, outputTokens },
                            }),
                        ]);

                        embedAndSaveMessage(assistantMsg.id, collectedText, apiKey ?? "").catch(() => {});

                        // Re-evaluate the workspace budget with the freshly logged
                        // usage; fires 80%/100% threshold notifications when crossed.
                        if (budgetWorkspaceId) {
                            recordWorkspaceSpendAndAlert(budgetWorkspaceId).catch(() => {});
                        }

                        dispatchWebhook(session.user.id, "message.created", {
                            chatId,
                            messageId: assistantMsg.id,
                            role: "assistant",
                            createdAt: assistantMsg.createdAt,
                        }).catch(() => {});

                        // Broadcast the completed assistant reply to other viewers.
                        // `triggeredBy` lets the author's own client ignore this echo
                        // (it already rendered the reply from its HTTP stream).
                        publish(chatId, {
                            type: "message",
                            triggeredBy: session.user.id,
                            message: {
                                id: assistantMsg.id,
                                role: "assistant",
                                content: collectedText,
                                authorId: null,
                                model: trimmedModel,
                                createdAt: assistantMsg.createdAt.toISOString(),
                            },
                        });

                        const assistantCount = await prisma.message.count({ where: { chatId, role: "assistant" } });
                        if (assistantCount % 4 === 0) {
                            const recentMsgs = await prisma.message.findMany({
                                where: { chatId },
                                orderBy: { createdAt: "desc" },
                                take: 10,
                                select: { role: true, content: true },
                            });
                            extractAndSaveMemories(session.user.id, chatId, recentMsgs.reverse(), apiKey ?? "", trimmedModel).catch(() => {});
                        }

                        const chat = await prisma.chat.findUnique({
                            where: { id: chatId },
                            select: { title: true, _count: { select: { messages: true } } },
                        });
                        if (chat?.title === "New Chat" && (chat._count.messages ?? 0) <= 2) {
                            const first = messages.find((m: any) => m.role === "user");
                            if (first) {
                                const newTitle = extractText(first).slice(0, 60);
                                await prisma.chat.update({ where: { id: chatId }, data: { title: newTitle } });
                                publish(chatId, { type: "title", title: newTitle });
                            }
                        }
                    }

                    succeeded = true;
                    break;
                } catch (error) {
                    logger.error("chat_model_error", { model: trimmedModel, error: String(error) });
                    if (sentAnyChunk) break; // already streaming to client, can't switch models
                }
            }

            if (!succeeded) {
                logger.error("chat_all_models_failed", { chatId, modelsAttempted: modelsToTry.length });
                // If nothing was streamed yet, surface an error to the client instead of
                // closing with an empty 200 (which renders as a blank assistant reply).
                controller.enqueue(encoder.encode("The service is temporarily unavailable. Please try again in a moment."));
            }
            } finally {
                if (session && chatId) {
                    publish(chatId, { type: "assistant-done", triggeredBy: session.user.id });
                }
                await closeMcp().catch(() => {});
                controller.close();
            }
        },
    });

    return new Response(bodyStream, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
}
