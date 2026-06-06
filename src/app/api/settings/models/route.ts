import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PROVIDER_MODELS, type ProviderModelItem } from "@/lib/ai-providers";

export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) {
        return new Response("Unauthorized", { status: 401 });
    }

    const settings = await prisma.setting.findMany({
        where: { key: { in: ["multiModelEnabled", "allowedModels", "openRouterApiKey", "providerApiKeys"] } },
    });
    const getSetting = (key: string) => settings.find((s) => s.key === key)?.value || "";

    const enabled = getSetting("multiModelEnabled") === "true";
    const allowedIds = getSetting("allowedModels").split(",").filter(Boolean);

    if (!enabled || allowedIds.length === 0) {
        return Response.json({ enabled: false, models: [] });
    }

    const providerKeys: Record<string, string> = (() => {
        try { return JSON.parse(getSetting("providerApiKeys") || "{}"); } catch { return {}; }
    })();

    // Collect all known non-OpenRouter models (static lists) as fallback name lookup
    const staticModels: Record<string, ProviderModelItem> = {};
    for (const list of Object.values(PROVIDER_MODELS)) {
        for (const m of list) staticModels[m.id] = m;
    }

    // Build name maps per provider
    const nameMap: Record<string, { name: string; provider: string }> = {};

    // OpenRouter
    const openrouterKey = getSetting("openRouterApiKey");
    if (openrouterKey) {
        try {
            const res = await fetch("https://openrouter.ai/api/v1/models", {
                headers: { Authorization: `Bearer ${openrouterKey}` },
                next: { revalidate: 3600 },
            });
            const data = await res.json();
            for (const m of (data.data || []) as { id: string; name: string }[]) {
                nameMap[m.id] = { name: m.name, provider: "openrouter" };
                nameMap[`openrouter:${m.id}`] = { name: m.name, provider: "openrouter" };
            }
        } catch { /* fall through */ }
    }

    // Anthropic
    if (providerKeys.anthropic) {
        try {
            const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
                headers: { "x-api-key": providerKeys.anthropic, "anthropic-version": "2023-06-01" },
                next: { revalidate: 3600 },
            });
            const data = await res.json();
            for (const m of (data.data || []) as { id: string; display_name?: string }[]) {
                nameMap[`anthropic:${m.id}`] = { name: m.display_name || m.id, provider: "anthropic" };
            }
        } catch { /* fall through */ }
    }

    const models = allowedIds.map((id) => {
        if (nameMap[id]) return { id, name: nameMap[id].name, provider: nameMap[id].provider };
        if (staticModels[id]) return { id, name: staticModels[id].name, provider: staticModels[id].provider };
        // OpenRouter bare id fallback
        const rawId = id.startsWith("openrouter:") ? id.slice("openrouter:".length) : id;
        if (nameMap[rawId]) return { id, name: nameMap[rawId].name, provider: "openrouter" };
        // For other providers, derive name from id suffix
        if (id.includes(":")) {
            const [provider, modelId] = id.split(":", 2);
            return { id, name: modelId, provider };
        }
        return { id, name: id, provider: "openrouter" };
    });

    return Response.json({ enabled: true, models });
}
