import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/push/unsubscribe — remove a Web Push subscription by endpoint
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: { endpoint?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body?.endpoint) {
        return NextResponse.json({ error: "endpoint required" }, { status: 400 });
    }

    // Scope delete to the current user so one user can't drop another's subscription.
    await prisma.pushSubscription.deleteMany({
        where: { endpoint: body.endpoint, userId: session.user.id },
    });

    return NextResponse.json({ ok: true });
}
