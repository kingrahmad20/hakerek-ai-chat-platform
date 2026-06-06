import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { executeEvalRun } from "@/lib/eval";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET — list runs (optionally filtered to one suite), newest first.
export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const suiteId = request.nextUrl.searchParams.get("suiteId") || undefined;
    const runs = await prisma.evalRun.findMany({
        where: suiteId ? { suiteId } : undefined,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
            id: true,
            suiteId: true,
            status: true,
            models: true,
            judgeModel: true,
            totalTasks: true,
            doneTasks: true,
            createdAt: true,
            completedAt: true,
            suite: { select: { name: true } },
        },
    });

    return NextResponse.json({ runs });
}

// POST — start a new run: { suiteId, models: string[], judgeModel?: string|null }.
export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const suiteId = String(body.suiteId ?? "");
    const models: string[] = Array.isArray(body.models)
        ? [...new Set((body.models as unknown[]).map((m) => String(m).trim()).filter(Boolean))].slice(0, 8)
        : [];
    const judgeModel = body.judgeModel ? String(body.judgeModel).trim() : null;

    if (!suiteId) return NextResponse.json({ error: "suiteId is required" }, { status: 400 });
    if (models.length === 0) return NextResponse.json({ error: "Pick at least one model" }, { status: 400 });

    const suite = await prisma.evalSuite.findUnique({
        where: { id: suiteId },
        select: { id: true, _count: { select: { cases: true } } },
    });
    if (!suite) return NextResponse.json({ error: "Suite not found" }, { status: 404 });
    if (suite._count.cases === 0) {
        return NextResponse.json({ error: "Suite has no test cases" }, { status: 400 });
    }

    const run = await prisma.evalRun.create({
        data: {
            suiteId,
            models,
            judgeModel,
            status: "running",
            totalTasks: suite._count.cases * models.length,
        },
        select: { id: true },
    });

    await logAudit(session.user.id, "START_EVAL_RUN", {
        targetType: "eval_run",
        targetId: run.id,
        metadata: { suiteId, models, judgeModel, tasks: suite._count.cases * models.length },
    });

    // Fire-and-forget: the standalone Node server keeps running after the
    // response, persisting results as they complete. The UI polls for progress.
    executeEvalRun(run.id).catch(() => {});

    return NextResponse.json({ id: run.id }, { status: 201 });
}
