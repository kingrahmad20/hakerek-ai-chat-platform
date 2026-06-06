import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

export async function GET() {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role;
    if (!role || !isAdminRole(role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const since = new Date(Date.now() - ONLINE_THRESHOLD_MS);
    const onlineUsers = await prisma.user.findMany({
        where: { lastSeenAt: { gte: since } },
        select: { id: true },
    });

    return NextResponse.json({ onlineIds: onlineUsers.map((u) => u.id) });
}
