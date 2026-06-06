import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    const enabled = await prisma.setting.findUnique({ where: { key: "subscriptionEnabled" } });
    if (enabled?.value !== "true") {
        return NextResponse.json({ enabled: false, plans: [] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plans = await (prisma as any).subscriptionPlan.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({
        enabled: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        plans: plans.map((p: any) => ({
            ...p,
            features: (() => { try { return JSON.parse(p.features); } catch { return []; } })(),
        })),
    });
}
