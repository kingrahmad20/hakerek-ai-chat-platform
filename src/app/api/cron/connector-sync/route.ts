import { NextResponse } from "next/server";
import { syncDueConnectors } from "@/lib/connectors/sync";

export const dynamic = "force-dynamic";
// Syncing fetches + embeds external documents and can take a while; give it room.
export const maxDuration = 300;

// Periodically refreshes knowledge-base connectors whose sync interval has
// elapsed. Protected by CRON_SECRET like the other cron routes.
export async function GET(req: Request) {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization");
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await syncDueConnectors();
    return NextResponse.json(result);
}
