import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Store } from "lucide-react";
import { TOOL_LABELS, TOOL_DESCRIPTIONS, type ToolName } from "@/lib/agent-tools";
import { parseMcpServers, MCP_TOOL_PREFIX } from "@/lib/mcp";
import { LibraryManager } from "@/components/library/library-manager";
import type { UserLibraryItemSummary } from "@/types";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/login?callbackUrl=/library");
    const userId = session.user.id;

    const [items, rawKbs, settings, memberships, kbListings] = await Promise.all([
        prisma.userLibraryItem.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            include: { listings: { where: { authorId: userId }, select: { shareToken: true, visibility: true } } },
        }),
        prisma.knowledgeBase.findMany({
            where: { userId },
            select: { id: true, name: true, _count: { select: { documents: true } } },
            orderBy: { updatedAt: "desc" },
        }),
        prisma.setting.findMany({ where: { key: { in: ["multiModelEnabled", "allowedModels", "toolsEnabled", "mcpServers"] } } }),
        prisma.workspaceMember.findMany({ where: { userId }, include: { workspace: { select: { id: true, name: true } } } }),
        prisma.marketplaceItem.findMany({
            where: { authorId: userId, type: "knowledge_base", knowledgeBaseId: { not: null } },
            select: { knowledgeBaseId: true, shareToken: true, visibility: true },
        }),
    ]);

    const kbListingMap = new Map(kbListings.map((l) => [l.knowledgeBaseId!, l]));
    const knowledgeBases = rawKbs.map((kb) => ({
        ...kb,
        publishedToken: kbListingMap.get(kb.id)?.shareToken ?? null,
        publishedVisibility: kbListingMap.get(kb.id)?.visibility ?? null,
    }));

    const getSetting = (key: string) => settings.find((s) => s.key === key)?.value ?? "";

    // Model options: only the platform allow-list (user-persona model binding is
    // gated by exactly this list in the chat path).
    const multiModelEnabled = getSetting("multiModelEnabled") === "true";
    const allowedModels = multiModelEnabled
        ? (getSetting("allowedModels") || "").split(",").map((s) => s.trim()).filter(Boolean).map((id) => ({ id, name: id }))
        : [];

    // Tool options: built-in + enabled MCP servers.
    const builtinTools = (Object.keys(TOOL_LABELS) as ToolName[]).map((id) => ({ id, label: TOOL_LABELS[id], description: TOOL_DESCRIPTIONS[id] }));
    const mcpTools = parseMcpServers(getSetting("mcpServers")).filter((s) => s.enabled).map((s) => ({ id: `${MCP_TOOL_PREFIX}${s.id}`, label: s.name, description: "MCP server" }));
    const toolOptions = [...builtinTools, ...mcpTools];
    const toolsEnabled = getSetting("toolsEnabled") === "true";

    const initialItems: (UserLibraryItemSummary & { publishedVisibility?: string | null })[] = items.map((it) => {
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(it.data); } catch { /* ignore */ }
        return {
            id: it.id,
            type: it.type as "persona" | "slash_command",
            enabled: it.enabled,
            sourceItemId: it.sourceItemId,
            name: String(data.name ?? data.command ?? ""),
            description: data.description ? String(data.description) : "",
            systemPrompt: data.systemPrompt ? String(data.systemPrompt) : undefined,
            model: data.model ? String(data.model) : undefined,
            knowledgeBaseIds: Array.isArray(data.knowledgeBaseIds) ? (data.knowledgeBaseIds as string[]) : [],
            toolIds: Array.isArray(data.toolIds) ? (data.toolIds as string[]) : [],
            command: data.command ? String(data.command) : undefined,
            prompt: data.prompt ? String(data.prompt) : undefined,
            publishedToken: it.listings[0]?.shareToken ?? null,
            publishedVisibility: it.listings[0]?.visibility ?? null,
            createdAt: it.createdAt.toISOString(),
        };
    });

    const workspaces = memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name }));

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="border-b border-gray-800 px-4 py-3 flex items-center gap-3">
                <Link href="/" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
                    <ArrowLeft size={16} /> Chat
                </Link>
                <span className="text-gray-600 text-sm">·</span>
                <span className="font-semibold text-white">My Library</span>
                <div className="ml-auto">
                    <Link href="/marketplace" className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors">
                        <Store size={15} /> Browse Marketplace
                    </Link>
                </div>
            </div>
            <div className="max-w-3xl mx-auto px-4 py-8">
                <LibraryManager
                    initialItems={initialItems}
                    knowledgeBases={knowledgeBases}
                    models={allowedModels}
                    toolOptions={toolOptions}
                    toolsEnabled={toolsEnabled}
                    workspaces={workspaces}
                />
            </div>
        </div>
    );
}
