import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getVapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

// GET /api/push/vapid — return the VAPID public key for PushManager.subscribe()
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const publicKey = await getVapidPublicKey();
    return NextResponse.json({ publicKey });
}
