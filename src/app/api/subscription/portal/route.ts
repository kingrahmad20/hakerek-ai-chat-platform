import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const secretKey = await prisma.setting.findUnique({ where: { key: "stripeSecretKey" } });
    if (!secretKey?.value) {
        return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = await (prisma as any).userSubscription.findUnique({
        where: { userId: session.user.id },
    });
    if (!sub?.stripeCustomerId) {
        return NextResponse.json({ error: "No active subscription" }, { status: 404 });
    }

    const stripe = new Stripe(secretKey.value);
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    const portalSession = await stripe.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: `${baseUrl}/subscription`,
    });

    return NextResponse.json({ url: portalSession.url });
}
