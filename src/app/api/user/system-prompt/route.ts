import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { systemPrompt } = await req.json();

    await prisma.user.update({
        where: { id: session.user.id },
        data: { systemPrompt: systemPrompt?.trim() || null },
    });

    return NextResponse.json({ ok: true });
}
