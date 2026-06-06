import { NextResponse } from "next/server";
import { processDueScheduledAgents } from "@/lib/scheduled-agents";

export const dynamic = "force-dynamic";
// Agent runs invoke the LLM (and tools) and can take a while; give the sweep room.
export const maxDuration = 300;

export async function GET(req: Request) {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization");
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await processDueScheduledAgents();
    return NextResponse.json(result);
}
