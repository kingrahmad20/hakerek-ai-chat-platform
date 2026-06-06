/* eslint-disable @typescript-eslint/no-explicit-any */
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SubscriptionPageClient } from "./subscription-client";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage({
    searchParams,
}: {
    searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) redirect("/login?callbackUrl=/subscription");

    const enabled = await prisma.setting.findUnique({ where: { key: "subscriptionEnabled" } });
    if (enabled?.value !== "true") redirect("/");

    const [plans, currentSub, pubKeySetting, appNameSetting] = await Promise.all([
        (prisma as any).subscriptionPlan.findMany({
            where: { active: true },
            orderBy: { sortOrder: "asc" },
        }),
        (prisma as any).userSubscription.findUnique({
            where: { userId: session.user.id },
            include: { plan: true },
        }),
        prisma.setting.findUnique({ where: { key: "stripePublishableKey" } }),
        prisma.setting.findUnique({ where: { key: "appName" } }),
    ]);

    const { success, canceled } = await searchParams;

    const parsedPlans = plans.map((p: any) => ({
        ...p,
        features: (() => { try { return JSON.parse(p.features); } catch { return []; } })(),
    }));

    const freePlan = parsedPlans.find((p: any) => p.name === "free") ?? null;
    const activePlan = currentSub
        ? { ...currentSub.plan, features: (() => { try { return JSON.parse(currentSub.plan.features); } catch { return []; } })() }
        : freePlan;

    return (
        <SubscriptionPageClient
            plans={parsedPlans}
            activePlan={activePlan}
            subscription={currentSub ? {
                id: currentSub.id,
                status: currentSub.status,
                currentPeriodEnd: currentSub.currentPeriodEnd?.toISOString() ?? null,
                cancelAtPeriodEnd: currentSub.cancelAtPeriodEnd,
                stripeCustomerId: currentSub.stripeCustomerId,
            } : null}
            stripePublishableKey={pubKeySetting?.value || ""}
            appName={appNameSetting?.value || "Hakerek"}
            flash={success === "true" ? "success" : canceled === "true" ? "canceled" : null}
        />
    );
}
