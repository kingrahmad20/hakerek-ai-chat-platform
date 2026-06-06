import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { loadAiConfig, analyzePendingChats } from "@/lib/conversation-intelligence";

export const dynamic = "force-dynamic";

// Analyze a capped batch of un-analyzed (or stale) chats. The admin UI calls
// this repeatedly until `remaining` reaches 0, mirroring the embed-messages
// backfill. Restricted to full ADMINs since it incurs LLM cost.
export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const config = await loadAiConfig();
    if (!config) {
        return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const result = await analyzePendingChats(config);
    return NextResponse.json(result);
}
