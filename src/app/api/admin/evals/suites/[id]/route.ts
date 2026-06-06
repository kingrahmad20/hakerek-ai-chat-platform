import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface CaseInput {
    prompt?: string;
    expected?: string | null;
}

function normalizeCases(raw: unknown): { prompt: string; expected: string | null; order: number }[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((c: CaseInput, i) => ({
            prompt: String(c?.prompt ?? "").trim().slice(0, 8000),
            expected: c?.expected ? String(c.expected).trim().slice(0, 8000) || null : null,
            order: i,
        }))
        .filter((c) => c.prompt.length > 0)
        .slice(0, 100);
}

// GET — a single suite with its ordered cases.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    const suite = await prisma.evalSuite.findUnique({
        where: { id },
        include: { cases: { orderBy: { order: "asc" } } },
    });
    if (!suite) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ suite });
}

// PUT — update suite metadata and replace its cases wholesale.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    const existing = await prisma.evalSuite.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const name = String(body.name ?? "").trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const description = body.description ? String(body.description).trim().slice(0, 500) : null;
    const systemPrompt = body.systemPrompt ? String(body.systemPrompt).trim().slice(0, 4000) : null;
    const cases = normalizeCases(body.cases);

    // Replace cases atomically. Past runs keep their EvalResult rows: results
    // reference caseId with onDelete: SetNull and carry a `prompt` snapshot, so
    // historical run data survives a suite edit.
    await prisma.$transaction([
        prisma.evalCase.deleteMany({ where: { suiteId: id } }),
        prisma.evalSuite.update({
            where: { id },
            data: { name, description, systemPrompt, cases: { create: cases } },
        }),
    ]);

    await logAudit(session.user.id, "UPDATE_EVAL_SUITE", {
        targetType: "eval_suite",
        targetId: id,
        targetLabel: name,
        metadata: { cases: cases.length },
    });

    return NextResponse.json({ ok: true });
}

// DELETE — remove a suite and (via cascade) its cases, runs, and results.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    const suite = await prisma.evalSuite.findUnique({ where: { id }, select: { name: true } });
    await prisma.evalSuite.delete({ where: { id } }).catch(() => {});
    await logAudit(session.user.id, "DELETE_EVAL_SUITE", {
        targetType: "eval_suite",
        targetId: id,
        targetLabel: suite?.name,
    });
    return NextResponse.json({ ok: true });
}
