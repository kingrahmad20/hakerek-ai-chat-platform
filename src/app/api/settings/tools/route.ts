import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TOOL_LABELS, TOOL_DESCRIPTIONS, type ToolName } from "@/lib/agent-tools";
import { parseMcpServers, MCP_TOOL_PREFIX } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const settings = await prisma.setting.findMany({
        where: {
            key: {
                in: ["toolsEnabled", "toolAllowedList", "toolSearchApiKey", "toolSearchProvider", "apiKeys", "openRouterApiKey", "mcpServers"],
            },
        },
    });

    const get = (key: string) => settings.find((s) => s.key === key)?.value || "";

    const toolsEnabled = get("toolsEnabled") === "true";
    const searchApiKey = get("toolSearchApiKey");
    const allowedRaw = get("toolAllowedList") || "web_search,calculator,datetime,url_fetch,generate_image";
    const allowedSet = new Set(allowedRaw.split(",").filter(Boolean) as ToolName[]);

    // The generate_image tool routes through OpenRouter, so it needs an LLM API key.
    let hasLLMKey = false;
    const apiKeysRaw = get("apiKeys");
    if (apiKeysRaw) {
        try {
            const keys: { key: string; active: boolean }[] = JSON.parse(apiKeysRaw);
            hasLLMKey = keys.some((k) => k.active && k.key);
        } catch { /* ignore */ }
    }
    if (!hasLLMKey) hasLLMKey = !!get("openRouterApiKey");

    const allTools: ToolName[] = ["web_search", "calculator", "datetime", "url_fetch", "generate_image"];

    // Only expose web_search if a search API key is configured, and generate_image
    // if an LLM API key is configured.
    const availableTools = allTools
        .filter((t) => allowedSet.has(t))
        .filter((t) => t !== "web_search" || !!searchApiKey)
        .filter((t) => t !== "generate_image" || hasLLMKey)
        .map((id) => ({ id, name: TOOL_LABELS[id], description: TOOL_DESCRIPTIONS[id] }));

    // Each enabled MCP server is surfaced as a single togglable picker entry.
    // Enabling it makes all of that server's tools available to the model.
    const mcpTools = parseMcpServers(get("mcpServers"))
        .filter((s) => s.enabled)
        .map((s) => ({
            id: `${MCP_TOOL_PREFIX}${s.id}`,
            name: s.name,
            description: s.description || "MCP server integration",
        }));

    return NextResponse.json({ enabled: toolsEnabled, tools: [...availableTools, ...mcpTools] });
}
