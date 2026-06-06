/* eslint-disable @typescript-eslint/no-explicit-any */
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Users, MessageSquare, Settings, LayoutDashboard, Key, Bot, ArrowLeft, ShieldCheck, FileText, Code2, Wrench, ScrollText, Webhook, CreditCard, LayoutTemplate, Terminal, Theater, Coffee, FlaskConical, Sparkles } from "lucide-react";
import { DashboardTab } from "@/components/admin/dashboard-tab";
import { ChatsTab } from "@/components/admin/chats-tab";
import { UsersTab } from "@/components/admin/users-tab";
import { ModelsTab } from "@/components/admin/models-tab";
import { ApiKeysTab } from "@/components/admin/apikeys-tab";
import { SettingsTab } from "@/components/admin/settings-tab";
import { RulesTab } from "@/components/admin/rules-tab";
import { TemplatesTab } from "@/components/admin/templates-tab";
import { PersonasTab } from "@/components/admin/personas-tab";
import { TOOL_LABELS, TOOL_DESCRIPTIONS, type ToolName } from "@/lib/agent-tools";
import { parseMcpServers, MCP_TOOL_PREFIX } from "@/lib/mcp";
import { SlashCommandsTab } from "@/components/admin/slash-commands-tab";
import { PagesTab } from "@/components/admin/pages-tab";
import { WidgetTab } from "@/components/admin/widget-tab";
import { ToolsTab } from "@/components/admin/tools-tab";
import { AuditLogTab } from "@/components/admin/audit-log-tab";
import { WebhooksTab } from "@/components/admin/webhooks-tab";
import { SubscriptionTab } from "@/components/admin/subscription-tab";
import { EvalsTab } from "@/components/admin/evals-tab";
import { ConversationIntelligenceTab } from "@/components/admin/conversation-intelligence-tab";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import Link from "next/link";
import type { AiRule, ConversationTemplate, SlashCommand, Persona } from "@/app/admin/actions";
import { PROVIDER_MODELS } from "@/lib/ai-providers";
import { isAdminRole } from "@/types";
import type { PlatformRole } from "@/types";

export const dynamic = "force-dynamic";

// Which tabs each role can see (ADMIN always sees all)
const ROLE_TABS: Record<Exclude<PlatformRole, "USER" | "ADMIN">, string[]> = {
    user_manager:      ["dashboard", "users"],
    content_moderator: ["dashboard", "chats", "intelligence", "pages"],
    billing_admin:     ["dashboard", "apikeys", "subscription"],
};

const ALL_NAV_ITEMS = [
    { key: "dashboard",  label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { key: "chats",      label: "Chats",     icon: <MessageSquare size={20} /> },
    { key: "intelligence", label: "Intelligence", icon: <Sparkles size={20} /> },
    { key: "users",      label: "Users",     icon: <Users size={20} /> },
    { key: "models",     label: "Models",    icon: <Bot size={20} /> },
    { key: "evals",      label: "Evals",     icon: <FlaskConical size={20} /> },
    { key: "rules",      label: "AI Rules",  icon: <ShieldCheck size={20} /> },
    { key: "personas",   label: "Personas",  icon: <Theater size={20} /> },
    { key: "templates",      label: "Templates",      icon: <LayoutTemplate size={20} /> },
    { key: "slash-commands", label: "Slash Commands", icon: <Terminal size={20} /> },
    { key: "pages",      label: "Pages",     icon: <FileText size={20} /> },
    { key: "apikeys",    label: "API Keys",  icon: <Key size={20} /> },
    { key: "widget",     label: "Widget",    icon: <Code2 size={20} /> },
    { key: "tools",      label: "Tools",     icon: <Wrench size={20} /> },
    { key: "webhooks",   label: "Webhooks",  icon: <Webhook size={20} /> },
    { key: "audit-log",    label: "Audit Log",    icon: <ScrollText size={20} /> },
    { key: "subscription", label: "Subscription", icon: <CreditCard size={20} /> },
    { key: "settings",     label: "Settings",     icon: <Settings size={20} /> },
];

function getNavItems(role: PlatformRole) {
    if (role === "ADMIN") return ALL_NAV_ITEMS;
    const allowed = ROLE_TABS[role as keyof typeof ROLE_TABS] ?? [];
    return ALL_NAV_ITEMS.filter((n) => allowed.includes(n.key));
}

export default async function AdminDashboard({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string; chatId?: string; userId?: string; error?: string; success?: string }>;
}) {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/login?callbackUrl=/admin");

    const userRole = session.user?.role as PlatformRole;
    if (!isAdminRole(userRole)) {
        return (
            <div className="p-8 text-white bg-gray-900 h-dvh flex items-center justify-center">
                Access denied.
            </div>
        );
    }

    const NAV_ITEMS = getNavItems(userRole);
    const allowedTabKeys = new Set(NAV_ITEMS.map((n) => n.key));

    const { tab: rawTab, chatId: detailChatId, userId: chatsUserId, error, success } = await searchParams;
    // Redirect to dashboard if the requested tab isn't accessible for this role
    const tab = rawTab && allowedTabKeys.has(rawTab) ? rawTab : "dashboard";

    const [settings, usersCount, chatsCount, messagesCount, tokenTotals] = await Promise.all([
        prisma.setting.findMany(),
        prisma.user.count(),
        prisma.chat.count(),
        prisma.message.count(),
        prisma.usageLog.aggregate({ _sum: { inputTokens: true, outputTokens: true } }),
    ]);

    const getSetting = (key: string) => settings.find((s: { key: string; value: string }) => s.key === key)?.value || "";

    // Parse AI rules
    const aiRulesSetting = getSetting("aiRules");
    const aiRules: AiRule[] = aiRulesSetting ? (() => { try { return JSON.parse(aiRulesSetting); } catch { return []; } })() : [];

    // Parse conversation templates
    const templatesSetting = getSetting("conversationTemplates");
    const conversationTemplates: ConversationTemplate[] = templatesSetting ? (() => { try { return JSON.parse(templatesSetting); } catch { return []; } })() : [];

    // Parse slash commands
    const slashCommandsSetting = getSetting("slashCommands");
    const slashCommands: SlashCommand[] = slashCommandsSetting ? (() => { try { return JSON.parse(slashCommandsSetting); } catch { return []; } })() : [];

    // Parse personas
    const personasSetting = getSetting("personas");
    const personas: Persona[] = personasSetting ? (() => { try { return JSON.parse(personasSetting); } catch { return []; } })() : [];

    const tabData: any = {};

    if (tab === "chats") {
        if (detailChatId) {
            tabData.detail = await prisma.chat.findUnique({
                where: { id: detailChatId },
                include: {
                    messages: { orderBy: { createdAt: "asc" } },
                    user: { select: { email: true, name: true } },
                },
            });
        } else if (chatsUserId) {
            // Conversations for a single selected user.
            tabData.chatsUserId = chatsUserId;
            tabData.chatsUser = await prisma.user.findUnique({
                where: { id: chatsUserId },
                select: { email: true, name: true },
            });
            tabData.chats = await prisma.chat.findMany({
                where: { userId: chatsUserId },
                include: {
                    user: { select: { email: true, name: true } },
                    _count: { select: { messages: true } },
                },
                orderBy: { updatedAt: "desc" },
                take: 100,
            });
        } else {
            // Top level: list users that have conversations, with chat counts.
            tabData.chatUsers = await prisma.user.findMany({
                where: { chats: { some: {} } },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    _count: { select: { chats: true } },
                },
                orderBy: { id: "desc" },
            });
        }
    }

    if (tab === "users") {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const [users, usageByUser] = await Promise.all([
            prisma.user.findMany({
                orderBy: { id: "desc" },
                select: {
                    id: true, name: true, email: true, role: true, banned: true,
                    monthlyMessageQuota: true, monthlyTokenQuota: true,
                    _count: { select: { chats: true } },
                },
            }),
            prisma.usageLog.groupBy({
                by: ["userId"],
                where: { createdAt: { gte: monthStart }, userId: { not: null } },
                _sum: { inputTokens: true, outputTokens: true },
                _count: { _all: true },
            }),
        ]);

        tabData.users = users.map((u) => {
            const usage = usageByUser.find((r) => r.userId === u.id);
            return {
                ...u,
                monthlyMsgUsed: usage?._count._all ?? 0,
                monthlyTokensUsed: (usage?._sum.inputTokens ?? 0) + (usage?._sum.outputTokens ?? 0),
            };
        });
    }

    if (tab === "pages") {
        tabData.pages = await prisma.page.findMany({ orderBy: { updatedAt: "desc" } });
    }

    if (tab === "subscription") {
        tabData.subscriptionPlans = await (prisma as any).subscriptionPlan.findMany({
            orderBy: { sortOrder: "asc" },
        });
    }

    if (tab === "personas") {
        // Knowledge bases the admin can bind to an assistant.
        tabData.knowledgeBases = await prisma.knowledgeBase.findMany({
            where: { userId: session.user.id },
            select: { id: true, name: true, _count: { select: { documents: true } } },
            orderBy: { updatedAt: "desc" },
        });
        // Tool options: built-in tools + enabled MCP servers (ids prefixed "mcp:").
        const builtinTools = (Object.keys(TOOL_LABELS) as ToolName[]).map((id) => ({
            id,
            label: TOOL_LABELS[id],
            description: TOOL_DESCRIPTIONS[id],
        }));
        const mcpTools = parseMcpServers(getSetting("mcpServers"))
            .filter((s) => s.enabled)
            .map((s) => ({ id: `${MCP_TOOL_PREFIX}${s.id}`, label: s.name, description: "MCP server" }));
        tabData.toolOptions = [...builtinTools, ...mcpTools];
        tabData.toolsEnabled = getSetting("toolsEnabled") === "true";
    }

    if (tab === "models" || tab === "personas" || tab === "evals") {
        const providerKeys = (() => { try { return JSON.parse(getSetting("providerApiKeys") || "{}"); } catch { return {} as Record<string, string>; } })();
        const openrouterKey = getSetting("openRouterApiKey");
        const allModels: any[] = [];

        // OpenRouter â€” fetch live if key present
        if (openrouterKey) {
            try {
                const res = await fetch("https://openrouter.ai/api/v1/models", {
                    headers: { Authorization: `Bearer ${openrouterKey}` },
                    next: { revalidate: 3600 },
                });
                const data = await res.json();
                allModels.push(
                    ...(data.data || [])
                        .map((m: any) => ({ ...m, provider: "openrouter" }))
                        .sort((a: any, b: any) => a.name.localeCompare(b.name))
                );
            } catch { /* ignore */ }
        }

        // OpenAI â€” fetch live if key present, else static fallback.
        // Honor a custom base URL for OpenAI-compatible endpoints (Azure, LM Studio, Ollama, vLLM, â€¦).
        if (providerKeys.openai) {
            const openaiBase = (providerKeys.openaiBaseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
            const isCustomBase = !!providerKeys.openaiBaseUrl;
            try {
                const res = await fetch(`${openaiBase}/models`, {
                    headers: { Authorization: `Bearer ${providerKeys.openai}` },
                    next: { revalidate: 3600 },
                });
                const data = await res.json();
                allModels.push(
                    ...(data.data || [])
                        .filter((m: any) => {
                            // Custom OpenAI-compatible servers expose arbitrary model IDs â€” list them all.
                            if (isCustomBase) return true;
                            const id: string = m.id;
                            if (/^(text-embedding|dall-e|tts-|whisper|babbage|davinci|ada-|curie|text-moderation|omni-moderation)/.test(id)) return false;
                            if (id.endsWith("-instruct")) return false;
                            return /^(gpt-|o1|o3|o4-|chatgpt-)/.test(id);
                        })
                        .map((m: any) => ({ id: `openai:${m.id}`, name: m.id, provider: "openai" }))
                        .sort((a: any, b: any) => a.name.localeCompare(b.name))
                );
            } catch {
                if (!isCustomBase) allModels.push(...PROVIDER_MODELS.openai.map((m) => ({ id: m.id, name: m.name, provider: m.provider })));
            }
        } else {
            allModels.push(...PROVIDER_MODELS.openai.map((m) => ({ id: m.id, name: m.name, provider: m.provider })));
        }

        // Anthropic â€” fetch live if key present, else static fallback
        if (providerKeys.anthropic) {
            try {
                const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
                    headers: { "x-api-key": providerKeys.anthropic, "anthropic-version": "2023-06-01" },
                    next: { revalidate: 3600 },
                });
                const data = await res.json();
                allModels.push(
                    ...(data.data || [])
                        .map((m: any) => ({ id: `anthropic:${m.id}`, name: m.display_name || m.id, provider: "anthropic" }))
                        .sort((a: any, b: any) => a.name.localeCompare(b.name))
                );
            } catch {
                allModels.push(...PROVIDER_MODELS.anthropic.map((m) => ({ id: m.id, name: m.name, provider: m.provider })));
            }
        } else {
            allModels.push(...PROVIDER_MODELS.anthropic.map((m) => ({ id: m.id, name: m.name, provider: m.provider })));
        }

        // DeepSeek â€” fetch live if key present, else static fallback
        if (providerKeys.deepseek) {
            try {
                const res = await fetch("https://api.deepseek.com/models", {
                    headers: { Authorization: `Bearer ${providerKeys.deepseek}` },
                    next: { revalidate: 3600 },
                });
                const data = await res.json();
                allModels.push(
                    ...(data.data || [])
                        .map((m: any) => ({ id: `deepseek:${m.id}`, name: m.id, provider: "deepseek" }))
                        .sort((a: any, b: any) => a.name.localeCompare(b.name))
                );
            } catch {
                allModels.push(...PROVIDER_MODELS.deepseek.map((m) => ({ id: m.id, name: m.name, provider: m.provider })));
            }
        } else {
            allModels.push(...PROVIDER_MODELS.deepseek.map((m) => ({ id: m.id, name: m.name, provider: m.provider })));
        }

        // Qwen â€” fetch live if key present, else static fallback
        if (providerKeys.qwen) {
            try {
                const res = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/models", {
                    headers: { Authorization: `Bearer ${providerKeys.qwen}` },
                    next: { revalidate: 3600 },
                });
                const data = await res.json();
                allModels.push(
                    ...(data.data || [])
                        .map((m: any) => ({ id: `qwen:${m.id}`, name: m.id, provider: "qwen" }))
                        .sort((a: any, b: any) => a.name.localeCompare(b.name))
                );
            } catch {
                allModels.push(...PROVIDER_MODELS.qwen.map((m) => ({ id: m.id, name: m.name, provider: m.provider })));
            }
        } else {
            allModels.push(...PROVIDER_MODELS.qwen.map((m) => ({ id: m.id, name: m.name, provider: m.provider })));
        }

        tabData.models = allModels;
    }

    const activeLabel = tab === "apikeys" ? "API Keys" : tab === "audit-log" ? "Audit Log" : NAV_ITEMS.find((n) => n.key === tab)?.label || tab;

    return (
        <div className="flex h-dvh overflow-hidden bg-gray-950 text-white font-sans">
            {/* Sidebar - desktop only */}
            <div className="hidden lg:flex w-64 bg-gray-900 border-r border-gray-800 flex-col shrink-0">
                <div className="p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        {getSetting("appName") || "Hakerek"} Admin
                    </h2>
                </div>
                <nav className="flex-1 p-4 space-y-1">
                    {NAV_ITEMS.map((item) => (
                        <a
                            key={item.key}
                            href={`/admin?tab=${item.key}`}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm ${
                                tab === item.key
                                    ? "bg-blue-600/10 text-blue-400 font-medium"
                                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                            }`}
                        >
                            {item.icon} {item.label}
                        </a>
                    ))}
                </nav>
                <div className="p-4 border-t border-gray-800 space-y-1">
                    <Link href="/" className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-gray-800">
                        <ArrowLeft size={16} /> Back to Chat
                    </Link>
                    <p className="px-3 text-xs text-gray-600">Version 1.2.1</p>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Mobile nav - shown only on small screens */}
                <nav className="flex lg:hidden overflow-x-auto border-b border-gray-800 bg-gray-900 shrink-0 scrollbar-hide">
                    {NAV_ITEMS.map((item) => (
                        <a
                            key={item.key}
                            href={`/admin?tab=${item.key}`}
                            className={`flex flex-col items-center gap-1 px-4 py-3 text-xs whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                                tab === item.key
                                    ? "border-blue-500 text-blue-400"
                                    : "border-transparent text-gray-400 hover:text-white"
                            }`}
                        >
                            {item.icon} {item.label}
                        </a>
                    ))}
                    <Link
                        href="/"
                        className="flex flex-col items-center gap-1 px-4 py-3 text-xs whitespace-nowrap shrink-0 border-b-2 border-transparent text-gray-500 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={20} /> Back
                    </Link>
                </nav>

                <header className="h-16 flex items-center justify-between gap-4 px-4 sm:px-8 border-b border-gray-800 bg-gray-900/50 shrink-0">
                    <h1 className="text-xl font-semibold capitalize">{activeLabel}</h1>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <a
                            href="https://ko-fi.com/kingsanolu"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold hover:from-amber-600 hover:to-orange-600 transition-colors shadow-sm"
                        >
                            <Coffee size={16} /> <span className="hidden sm:inline">BUY ME COFE</span>
                        </a>
                        <ThemeToggle />
                    </div>
                </header>

                <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8">
                    {tab === "dashboard" && (
                        <DashboardTab
                            usersCount={usersCount}
                            chatsCount={chatsCount}
                            messagesCount={messagesCount}
                            totalInputTokens={tokenTotals._sum.inputTokens ?? 0}
                            totalOutputTokens={tokenTotals._sum.outputTokens ?? 0}
                        />
                    )}
                    {tab === "chats" && (
                        <ChatsTab
                            users={tabData.chatUsers}
                            chats={tabData.chats}
                            detail={tabData.detail}
                            detailChatId={detailChatId}
                            userId={tabData.chatsUserId}
                            userInfo={tabData.chatsUser}
                        />
                    )}
                    {tab === "intelligence" && (
                        <ConversationIntelligenceTab />
                    )}
                    {tab === "users" && (
                        <UsersTab users={tabData.users || []} currentUserId={session.user.id} currentUserRole={userRole} />
                    )}
                    {tab === "models" && (
                        <ModelsTab
                            models={tabData.models || []}
                            savedDefault={getSetting("defaultModel")}
                            savedFallbacks={getSetting("fallbackModels").split(",").filter(Boolean)}
                            hasApiKey={!!getSetting("openRouterApiKey") || (() => {
                                try {
                                    const k = JSON.parse(getSetting("providerApiKeys") || "{}");
                                    return !!(k.openai || k.anthropic || k.deepseek || k.qwen);
                                } catch { return false; }
                            })()}
                            rateLimitPerDay={parseInt(getSetting("rateLimitPerDay") || "0")}
                            multiModelEnabled={getSetting("multiModelEnabled") === "true"}
                            allowedModels={getSetting("allowedModels").split(",").filter(Boolean)}
                        />
                    )}
                    {tab === "evals" && (
                        <EvalsTab
                            models={tabData.models || []}
                            defaultModel={getSetting("defaultModel")}
                            hasApiKey={!!getSetting("openRouterApiKey") || (() => {
                                try {
                                    const k = JSON.parse(getSetting("providerApiKeys") || "{}");
                                    return !!(k.openai || k.anthropic || k.deepseek || k.qwen);
                                } catch { return false; }
                            })()}
                        />
                    )}
                    {tab === "rules" && (
                        <RulesTab rules={aiRules} />
                    )}
                    {tab === "personas" && (
                        <PersonasTab
                            personas={personas}
                            models={tabData.models || []}
                            knowledgeBases={tabData.knowledgeBases || []}
                            toolOptions={tabData.toolOptions || []}
                            toolsEnabled={tabData.toolsEnabled ?? false}
                        />
                    )}
                    {tab === "templates" && (
                        <TemplatesTab templates={conversationTemplates} />
                    )}
                    {tab === "slash-commands" && (
                        <SlashCommandsTab commands={slashCommands} />
                    )}
                    {tab === "pages" && (
                        <PagesTab pages={tabData.pages || []} />
                    )}
                    {tab === "apikeys" && (
                        <ApiKeysTab
                            turnstile={{
                                siteKey: getSetting("turnstileSiteKey"),
                                secretKey: getSetting("turnstileSecretKey"),
                                enabled: getSetting("turnstileEnabled") === "true",
                            }}
                            googleOAuth={{
                                clientId: getSetting("googleClientId"),
                                clientSecret: getSetting("googleClientSecret"),
                                enabled: getSetting("googleEnabled") === "true",
                            }}
                            oidcSso={{
                                name: getSetting("oidcName"),
                                issuer: getSetting("oidcIssuer"),
                                clientId: getSetting("oidcClientId"),
                                clientSecret: getSetting("oidcClientSecret"),
                                enabled: getSetting("oidcEnabled") === "true",
                            }}
                            cohere={{
                                apiKey: getSetting("cohereApiKey"),
                                enabled: getSetting("cohereEnabled") === "true",
                            }}
                            connectorGoogle={{
                                clientId: getSetting("connectorGoogleClientId"),
                                clientSecret: getSetting("connectorGoogleClientSecret"),
                            }}
                            providerApiKeys={(() => {
                                const stored = (() => { try { return JSON.parse(getSetting("providerApiKeys") || "{}"); } catch { return {}; } })();
                                return { openrouter: getSetting("openRouterApiKey"), ...stored };
                            })()}
                        />
                    )}
                    {tab === "tools" && (
                        <ToolsTab
                            toolsEnabled={getSetting("toolsEnabled") === "true"}
                            searchProvider={getSetting("toolSearchProvider") || "serper"}
                            searchApiKey={getSetting("toolSearchApiKey")}
                            allowedTools={(getSetting("toolAllowedList") || "web_search,calculator,datetime,url_fetch,generate_image").split(",").filter(Boolean)}
                            mcpServers={(() => { try { return JSON.parse(getSetting("mcpServers") || "[]"); } catch { return []; } })()}
                        />
                    )}
                    {tab === "widget" && (
                        <WidgetTab
                            widgetEnabled={getSetting("widgetEnabled") === "true"}
                            widgetTitle={getSetting("widgetTitle")}
                            widgetColor={getSetting("widgetColor") || "#3B82F6"}
                            widgetPosition={getSetting("widgetPosition") || "bottom-right"}
                            widgetBotName={getSetting("widgetBotName")}
                            widgetWelcomeMessage={getSetting("widgetWelcomeMessage")}
                            widgetSystemPrompt={getSetting("widgetSystemPrompt")}
                            widgetRateLimitPerHour={getSetting("widgetRateLimitPerHour") || "20"}
                            baseUrl={process.env.NEXTAUTH_URL || ""}
                        />
                    )}
                    {tab === "webhooks" && (
                        <WebhooksTab />
                    )}
                    {tab === "audit-log" && (
                        <AuditLogTab />
                    )}
                    {tab === "subscription" && (
                        <SubscriptionTab
                            subscriptionEnabled={getSetting("subscriptionEnabled") === "true"}
                            stripePublishableKey={getSetting("stripePublishableKey")}
                            stripeSecretKey={getSetting("stripeSecretKey")}
                            stripeWebhookSecret={getSetting("stripeWebhookSecret")}
                            plans={(tabData.subscriptionPlans || []).map((p: any) => ({
                                ...p,
                                features: (() => { try { return JSON.parse(p.features); } catch { return []; } })(),
                            }))}
                        />
                    )}
                    {tab === "settings" && (
                        <SettingsTab
                            smtp={{
                                host: getSetting("smtp_host"),
                                port: getSetting("smtp_port"),
                                user: getSetting("smtp_user"),
                                pass: getSetting("smtp_pass"),
                                from: getSetting("smtp_from"),
                                secure: getSetting("smtp_secure"),
                            }}
                            emailVerificationRequired={getSetting("emailVerificationRequired") === "true"}
                            allowFileUpload={getSetting("allowFileUpload") === "true"}
                            maintenanceModeEnabled={getSetting("maintenanceModeEnabled") === "true"}
                            logoVersion={getSetting("logoVersion")}
                            faviconVersion={getSetting("faviconVersion")}
                            appName={getSetting("appName") || "Hakerek"}
                            appDescription={getSetting("appDescription") || "Your intelligent AI assistant for every question."}
                            voice={{
                                sttEnabled: getSetting("sttEnabled") === "true",
                                sttModel: getSetting("sttModel") || "whisper-1",
                                sttLanguage: getSetting("sttLanguage"),
                                ttsEnabled: getSetting("ttsEnabled") === "true",
                                ttsProvider: getSetting("ttsProvider") || "openai",
                                ttsModel: getSetting("ttsModel") || "tts-1",
                                ttsVoice: getSetting("ttsVoice") || "alloy",
                                elevenLabsConfigured: !!getSetting("elevenLabsApiKey"),
                                elevenLabsVoiceId: getSetting("elevenLabsVoiceId") || "21m00Tcm4TlvDq8ikWAM",
                                elevenLabsModelId: getSetting("elevenLabsModelId") || "eleven_multilingual_v2",
                            }}
                            error={error}
                            success={success}
                        />
                    )}
                </main>
            </div>
        </div>
    );
}
