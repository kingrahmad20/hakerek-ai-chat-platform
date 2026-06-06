import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const WIDGET_SETTING_KEYS = [
    "widgetEnabled",
    "widgetTitle",
    "widgetColor",
    "widgetPosition",
    "widgetBotName",
    "widgetWelcomeMessage",
];

export async function GET() {
    const settings = await prisma.setting.findMany({
        where: { key: { in: WIDGET_SETTING_KEYS } },
    });
    const get = (key: string) => settings.find((s) => s.key === key)?.value ?? "";

    return NextResponse.json(
        {
            enabled: get("widgetEnabled") === "true",
            title: get("widgetTitle") || "Chat with Us",
            color: get("widgetColor") || "#3B82F6",
            position: get("widgetPosition") || "bottom-right",
            botName: get("widgetBotName") || "Assistant",
            welcomeMessage: get("widgetWelcomeMessage") || "",
        },
        {
            headers: {
                "Cache-Control": "public, max-age=60",
                "Access-Control-Allow-Origin": "*",
            },
        }
    );
}
