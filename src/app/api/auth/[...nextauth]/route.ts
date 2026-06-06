/* eslint-disable @typescript-eslint/no-explicit-any */
import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { buildAuthOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: any) {
    const options = await buildAuthOptions();
    return (NextAuth(options) as any)(req, ctx);
}

export async function POST(req: NextRequest, ctx: any) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    if (!await rateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
        return NextResponse.json({ error: "Too many login attempts. Please try again later." }, { status: 429 });
    }

    const options = await buildAuthOptions();
    return (NextAuth(options) as any)(req, ctx);
}
