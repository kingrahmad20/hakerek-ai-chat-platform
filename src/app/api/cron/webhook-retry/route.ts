import { NextResponse } from "next/server";
import { processWebhookRetries } from "@/lib/webhook";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization");
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await processWebhookRetries();
    return NextResponse.json(result);
}
