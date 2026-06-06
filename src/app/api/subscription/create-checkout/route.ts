import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await req.json();

    const secretKey = await prisma.setting.findUnique({ where: { key: "stripeSecretKey" } });
    if (!secretKey?.value) {
        return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plan = await (prisma as any).subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.stripePriceId) {
        return NextResponse.json({ error: "Plan not found or not configured" }, { status: 404 });
    }

    const stripe = new Stripe(secretKey.value);
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    let stripeCustomerId: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingSub = await (prisma as any).userSubscription.findUnique({
        where: { userId: session.user.id },
    });
    if (existingSub?.stripeCustomerId) {
        stripeCustomerId = existingSub.stripeCustomerId;
    }

    const checkoutSession = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        customer: stripeCustomerId,
        customer_email: stripeCustomerId ? undefined : (session.user.email ?? undefined),
        success_url: `${baseUrl}/subscription?success=true`,
        cancel_url: `${baseUrl}/subscription?canceled=true`,
        metadata: {
            userId: session.user.id,
            planId: plan.id,
        },
    });

    return NextResponse.json({ url: checkoutSession.url });
}
