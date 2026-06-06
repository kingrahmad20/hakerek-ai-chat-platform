/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";

async function requireAdmin() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || !isAdminRole(session.user.role)) {
        return null;
    }
    return session;
}

export const dynamic = "force-dynamic";

export async function GET() {
    if (!await requireAdmin()) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const plans = await (prisma as any).subscriptionPlan.findMany({ orderBy: { sortOrder: "asc" } });
    return NextResponse.json(plans);
}

export async function POST(req: NextRequest) {
    if (!await requireAdmin()) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "saveSettings") {
        const { subscriptionEnabled, stripePublishableKey, stripeSecretKey, stripeWebhookSecret } = body;

        const upsert = (key: string, value: string) =>
            prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });

        await Promise.all([
            upsert("subscriptionEnabled", subscriptionEnabled ? "true" : "false"),
            upsert("stripePublishableKey", stripePublishableKey || ""),
            upsert("stripeSecretKey", stripeSecretKey || ""),
            upsert("stripeWebhookSecret", stripeWebhookSecret || ""),
        ]);

        return NextResponse.json({ ok: true });
    }

    if (action === "savePlan") {
        const { plan } = body;
        const updated = await (prisma as any).subscriptionPlan.update({
            where: { id: plan.id },
            data: {
                displayName: plan.displayName,
                stripePriceId: plan.stripePriceId || null,
                monthlyPrice: plan.monthlyPrice,
                features: JSON.stringify(plan.features),
                messageLimit: plan.messageLimit ?? null,
                tokenLimit: plan.tokenLimit ?? null,
                active: plan.active,
            },
        });
        return NextResponse.json({ ...updated, features: JSON.parse(updated.features) });
    }

    if (action === "createPlan") {
        const { name, displayName } = body;
        const count = await (prisma as any).subscriptionPlan.count();
        const plan = await (prisma as any).subscriptionPlan.create({
            data: {
                name,
                displayName,
                monthlyPrice: 0,
                features: "[]",
                sortOrder: count,
                active: true,
            },
        });
        return NextResponse.json({ ...plan, features: [] });
    }

    if (action === "deletePlan") {
        const { id } = body;
        const plan = await (prisma as any).subscriptionPlan.findUnique({ where: { id } });
        if (!plan || plan.name === "free") {
            return NextResponse.json({ error: "Cannot delete free plan" }, { status: 400 });
        }
        const freePlan = await (prisma as any).subscriptionPlan.findUnique({ where: { name: "free" } });
        if (freePlan) {
            await (prisma as any).userSubscription.updateMany({
                where: { planId: id },
                data: { planId: freePlan.id },
            });
        }
        await (prisma as any).subscriptionPlan.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
