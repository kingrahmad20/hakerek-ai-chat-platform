import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role;
    if (!role || !isAdminRole(role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const apiKeySetting = await prisma.setting.findUnique({ where: { key: "openRouterApiKey" } });
    const apiKey = apiKeySetting?.value;
    if (!apiKey) return NextResponse.json({ error: "No API key configured" }, { status: 400 });

    try {
        const res = await fetch("https://openrouter.ai/api/v1/credits", {
            headers: { Authorization: `Bearer ${apiKey}` },
            cache: "no-store",
        });
        if (!res.ok) return NextResponse.json({ error: "OpenRouter error" }, { status: res.status });
        const data = await res.json();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ error: "Failed to fetch credits" }, { status: 500 });
    }
}
