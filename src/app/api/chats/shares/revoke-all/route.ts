import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { count } = await prisma.chat.updateMany({
        where: { userId: session.user.id, shareToken: { not: null } },
        data: { shareToken: null, shareExpiresAt: null, shareViewCount: 0 },
    });

    return NextResponse.json({ revoked: count });
}
