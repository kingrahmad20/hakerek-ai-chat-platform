import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const setting = await prisma.setting.findUnique({
            where: { key: "maintenanceModeEnabled" },
        });
        return NextResponse.json(
            { enabled: setting?.value === "true" },
            { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } }
        );
    } catch {
        return NextResponse.json({ enabled: false });
    }
}
