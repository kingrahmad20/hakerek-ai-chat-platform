import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAndRecord } from "@/lib/scheduled-agents";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Owner-triggered "run now". Executes the agent immediately and returns the
// result; the agent's normal schedule (nextRunAt) is also recomputed inside
// runAndRecord, so this does not disrupt the recurring cadence.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const agent = await prisma.scheduledAgent.findUnique({ where: { id } });
    if (!agent || agent.userId !== session.user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await runAndRecord(agent);
    return NextResponse.json({
        status: result.status,
        output: result.output ?? null,
        error: result.error ?? null,
    });
}
