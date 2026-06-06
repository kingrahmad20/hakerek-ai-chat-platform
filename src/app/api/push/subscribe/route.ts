import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/push/subscribe — store (or refresh) a Web Push subscription for the user
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    try {
        sub = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
        return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;

    // Endpoint is globally unique. Upsert so re-subscribing moves it to this user.
    await prisma.pushSubscription.upsert({
        where: { endpoint },
        create: { userId: session.user.id, endpoint, p256dh, auth, userAgent },
        update: { userId: session.user.id, p256dh, auth, userAgent },
    });

    return NextResponse.json({ ok: true });
}
