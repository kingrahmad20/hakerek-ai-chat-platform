import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Web App Manifest — makes the app installable on mobile/desktop.
// App name/description come from the Setting table (admin-configurable), with
// sensible fallbacks so this works before any settings are saved.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
    let name = "Hakerek";
    let description = "Your intelligent AI assistant for every question.";
    try {
        const settings = await prisma.setting.findMany({
            where: { key: { in: ["appName", "appDescription"] } },
        });
        const get = (k: string) => settings.find((s) => s.key === k)?.value;
        name = get("appName") || name;
        description = get("appDescription") || description;
    } catch {
        // DB unavailable (e.g. during build) — use defaults
    }

    return {
        name,
        short_name: name,
        description,
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}
