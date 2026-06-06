import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscription = await (prisma as any).userSubscription.findUnique({
        where: { userId: session.user.id },
        include: { plan: true },
    });

    if (!subscription) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const freePlan = await (prisma as any).subscriptionPlan.findUnique({ where: { name: "free" } });
        return NextResponse.json({
            plan: freePlan ? { ...freePlan, features: (() => { try { return JSON.parse(freePlan.features); } catch { return []; } })() } : null,
            subscription: null,
        });
    }

    return NextResponse.json({
        plan: {
            ...subscription.plan,
            features: (() => { try { return JSON.parse(subscription.plan.features); } catch { return []; } })(),
        },
        subscription: {
            id: subscription.id,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        },
    });
}
