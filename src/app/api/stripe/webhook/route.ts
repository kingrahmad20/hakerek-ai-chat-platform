/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const secretKey = await prisma.setting.findUnique({ where: { key: "stripeSecretKey" } });
    const webhookSecret = await prisma.setting.findUnique({ where: { key: "stripeWebhookSecret" } });

    if (!secretKey?.value || !webhookSecret?.value) {
        return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
    }

    const stripe = new Stripe(secretKey.value);
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(body, sig!, webhookSecret.value);
    } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    switch (event.type) {
        case "checkout.session.completed": {
            const cs = event.data.object as Stripe.Checkout.Session;
            if (cs.mode !== "subscription") break;
            const userId = cs.metadata?.userId;
            const planId = cs.metadata?.planId;
            if (!userId || !planId) break;

            const stripeSubId = cs.subscription as string;
            const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);

            await (prisma as any).userSubscription.upsert({
                where: { userId },
                create: {
                    userId,
                    planId,
                    stripeCustomerId: cs.customer as string,
                    stripeSubscriptionId: stripeSubId,
                    status: stripeSub.status,
                    currentPeriodStart: new Date(stripeSub.items.data[0].current_period_start * 1000),
                    currentPeriodEnd: new Date(stripeSub.items.data[0].current_period_end * 1000),
                    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
                },
                update: {
                    planId,
                    stripeCustomerId: cs.customer as string,
                    stripeSubscriptionId: stripeSubId,
                    status: stripeSub.status,
                    currentPeriodStart: new Date(stripeSub.items.data[0].current_period_start * 1000),
                    currentPeriodEnd: new Date(stripeSub.items.data[0].current_period_end * 1000),
                    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
                },
            });
            break;
        }

        case "customer.subscription.updated": {
            const sub = event.data.object as Stripe.Subscription;
            const planId = await resolvePlanFromSub(sub);
            if (!planId) break;

            await (prisma as any).userSubscription.updateMany({
                where: { stripeSubscriptionId: sub.id },
                data: {
                    planId,
                    status: sub.status,
                    currentPeriodStart: new Date(sub.items.data[0].current_period_start * 1000),
                    currentPeriodEnd: new Date(sub.items.data[0].current_period_end * 1000),
                    cancelAtPeriodEnd: sub.cancel_at_period_end,
                },
            });
            break;
        }

        case "customer.subscription.deleted": {
            const sub = event.data.object as Stripe.Subscription;
            const freePlan = await (prisma as any).subscriptionPlan.findUnique({ where: { name: "free" } });
            await (prisma as any).userSubscription.updateMany({
                where: { stripeSubscriptionId: sub.id },
                data: {
                    planId: freePlan?.id ?? undefined,
                    status: "canceled",
                    stripeSubscriptionId: null,
                    cancelAtPeriodEnd: false,
                },
            });
            break;
        }
    }

    return NextResponse.json({ received: true });
}

async function resolvePlanFromSub(sub: Stripe.Subscription): Promise<string | null> {
    const priceId = sub.items.data[0]?.price?.id;
    if (!priceId) return null;
    const plan = await (prisma as any).subscriptionPlan.findFirst({ where: { stripePriceId: priceId } });
    return plan?.id ?? null;
}
