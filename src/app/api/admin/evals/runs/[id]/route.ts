import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/pricing";

export const dynamic = "force-dynamic";

interface ModelAgg {
    model: string;
    count: number;
    errors: number;
    avgScore: number | null;
    passRate: number | null;
    avgLatencyMs: number;
    inputTokens: number;
    outputTokens: number;
    estCostUsd: number;
}

// GET — run detail: per-model aggregates plus every individual result.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    const run = await prisma.evalRun.findUnique({
        where: { id },
        include: {
            suite: { select: { name: true } },
            results: { orderBy: { createdAt: "asc" } },
        },
    });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Aggregate per model.
    const groups = new Map<string, typeof run.results>();
    for (const r of run.results) {
        const arr = groups.get(r.model) ?? [];
        arr.push(r);
        groups.set(r.model, arr);
    }

    const byModel: ModelAgg[] = [...groups.entries()].map(([model, rows]) => {
        const errors = rows.filter((r) => r.error).length;
        const scored = rows.filter((r) => r.score !== null);
        const judged = rows.filter((r) => r.passed !== null);
        const passes = judged.filter((r) => r.passed).length;
        const inputTokens = rows.reduce((s, r) => s + r.inputTokens, 0);
        const outputTokens = rows.reduce((s, r) => s + r.outputTokens, 0);
        return {
            model,
            count: rows.length,
            errors,
            avgScore: scored.length
                ? parseFloat((scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length).toFixed(2))
                : null,
            passRate: judged.length ? Math.round((passes / judged.length) * 100) : null,
            avgLatencyMs: rows.length ? Math.round(rows.reduce((s, r) => s + r.latencyMs, 0) / rows.length) : 0,
            inputTokens,
            outputTokens,
            estCostUsd: estimateCostUsd(model, inputTokens, outputTokens),
        };
    });

    // Best model first: by avg judge score, then pass rate, then lowest latency.
    byModel.sort((a, b) => {
        if ((b.avgScore ?? -1) !== (a.avgScore ?? -1)) return (b.avgScore ?? -1) - (a.avgScore ?? -1);
        if ((b.passRate ?? -1) !== (a.passRate ?? -1)) return (b.passRate ?? -1) - (a.passRate ?? -1);
        return a.avgLatencyMs - b.avgLatencyMs;
    });

    return NextResponse.json({
        run: {
            id: run.id,
            suiteId: run.suiteId,
            suiteName: run.suite.name,
            status: run.status,
            models: run.models,
            judgeModel: run.judgeModel,
            totalTasks: run.totalTasks,
            doneTasks: run.doneTasks,
            error: run.error,
            createdAt: run.createdAt,
            completedAt: run.completedAt,
        },
        byModel,
        results: run.results.map((r) => ({
            id: r.id,
            caseId: r.caseId,
            prompt: r.prompt,
            model: r.model,
            output: r.output,
            score: r.score,
            passed: r.passed,
            rationale: r.rationale,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            latencyMs: r.latencyMs,
            error: r.error,
        })),
    });
}
