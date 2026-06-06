import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// One-time endpoint to seed default Free/Pro/Ultra plans
export async function POST() {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const defaultPlans = [
        {
            name: "free",
            displayName: "Free",
            monthlyPrice: 0,
            features: JSON.stringify(["Basic AI chat", "5 chats / day", "Community support"]),
            messageLimit: 150,
            tokenLimit: 100000,
            sortOrder: 0,
            active: true,
        },
        {
            name: "pro",
            displayName: "Pro",
            monthlyPrice: 9.99,
            features: JSON.stringify(["Everything in Free", "Unlimited chats", "Priority support", "Advanced models"]),
            messageLimit: null,
            tokenLimit: 1000000,
            sortOrder: 1,
            active: true,
        },
        {
            name: "ultra",
            displayName: "Ultra",
            monthlyPrice: 29.99,
            features: JSON.stringify(["Everything in Pro", "Unlimited tokens", "Dedicated support", "Early access to features"]),
            messageLimit: null,
            tokenLimit: null,
            sortOrder: 2,
            active: true,
        },
    ];

    const results = [];
    for (const plan of defaultPlans) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = await (prisma as any).subscriptionPlan.findUnique({ where: { name: plan.name } });
        if (!existing) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const created = await (prisma as any).subscriptionPlan.create({ data: plan });
            results.push({ action: "created", name: created.name });
        } else {
            results.push({ action: "skipped", name: plan.name });
        }
    }

    return NextResponse.json({ results });
}
