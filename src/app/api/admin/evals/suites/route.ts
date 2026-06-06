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

/** Normalize raw case input into ordered, length-capped, non-empty cases. */
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

// GET — list all suites with case + run counts.
export async function GET() {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const suites = await prisma.evalSuite.findMany({
        orderBy: { updatedAt: "desc" },
        select: {
            id: true,
            name: true,
            description: true,
            systemPrompt: true,
            updatedAt: true,
            _count: { select: { cases: true, runs: true } },
        },
    });

    return NextResponse.json({ suites });
}

// POST — create a new suite with its cases.
export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const name = String(body.name ?? "").trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const description = body.description ? String(body.description).trim().slice(0, 500) : null;
    const systemPrompt = body.systemPrompt ? String(body.systemPrompt).trim().slice(0, 4000) : null;
    const cases = normalizeCases(body.cases);

    const suite = await prisma.evalSuite.create({
        data: {
            name,
            description,
            systemPrompt,
            userId: session.user.id,
            cases: { create: cases },
        },
        select: { id: true },
    });

    await logAudit(session.user.id, "CREATE_EVAL_SUITE", {
        targetType: "eval_suite",
        targetId: suite.id,
        targetLabel: name,
        metadata: { cases: cases.length },
    });

    return NextResponse.json({ id: suite.id }, { status: 201 });
}
