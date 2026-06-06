import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ ok: false }, { status: 401 });

    await prisma.user.update({
        where: { id: session.user.id },
        data: { lastSeenAt: new Date() },
    });

    return NextResponse.json({ ok: true });
}
