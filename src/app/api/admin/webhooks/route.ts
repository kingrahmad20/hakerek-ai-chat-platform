import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processWebhookRetries } from "@/lib/webhook";

export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    const [totalFailed, pendingRetries, dueNow, recentFailures] = await Promise.all([
        // Permanently failed (exhausted all retries: nextRetryAt is null and retryCount > 0)
        prisma.webhookDelivery.count({
            where: { success: false, nextRetryAt: null, retryCount: { gt: 0 } },
        }),
        // Queued for future retry
        prisma.webhookDelivery.count({
            where: { success: false, nextRetryAt: { gt: now } },
        }),
        // Due for retry right now
        prisma.webhookDelivery.count({
            where: { success: false, nextRetryAt: { lte: now } },
        }),
        // Recent failures across all users
        prisma.webhookDelivery.findMany({
            where: { success: false },
            orderBy: { createdAt: "desc" },
            take: 100,
            select: {
                id: true,
                event: true,
                status: true,
                retryCount: true,
                nextRetryAt: true,
                lastError: true,
                createdAt: true,
                webhook: {
                    select: {
                        id: true,
                        name: true,
                        url: true,
                        user: { select: { email: true } },
                    },
                },
            },
        }),
    ]);

    return NextResponse.json({ totalFailed, pendingRetries, dueNow, recentFailures });
}

export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await processWebhookRetries();
    return NextResponse.json(result);
}
