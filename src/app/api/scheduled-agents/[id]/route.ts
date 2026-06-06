import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCron, getNextRun, describeCron } from "@/lib/cron";

export const dynamic = "force-dynamic";

const VALID_TOOLS = new Set(["web_search", "calculator", "datetime", "url_fetch", "generate_image"]);

function isValidTimezone(tz: string): boolean {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

function sanitizeTools(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.filter((t): t is string => typeof t === "string" && VALID_TOOLS.has(t)))];
}

async function getOwned(id: string, userId: string) {
    const agent = await prisma.scheduledAgent.findUnique({ where: { id } });
    if (!agent || agent.userId !== userId) return null;
    return agent;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const agent = await getOwned(id, session.user.id);
    if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const runs = await prisma.scheduledAgentRun.findMany({
        where: { agentId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
            id: true, status: true, output: true, error: true,
            inputTokens: true, outputTokens: true, durationMs: true, createdAt: true,
        },
    });

    return NextResponse.json({ ...agent, scheduleLabel: describeCron(agent.schedule), runs });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const agent = await getOwned(id, session.user.id);
    if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
        data.name = name.slice(0, 80);
    }
    if (body.prompt !== undefined) {
        const prompt = String(body.prompt).trim();
        if (!prompt) return NextResponse.json({ error: "Prompt cannot be empty" }, { status: 400 });
        if (prompt.length > 8000) return NextResponse.json({ error: "Prompt is too long (max 8000 chars)" }, { status: 400 });
        data.prompt = prompt;
    }
    if (body.schedule !== undefined) {
        const schedule = String(body.schedule).trim();
        if (!isValidCron(schedule)) return NextResponse.json({ error: "Invalid schedule (cron) expression" }, { status: 400 });
        data.schedule = schedule;
    }
    if (body.timezone !== undefined) {
        const tz = String(body.timezone).trim() || "UTC";
        if (!isValidTimezone(tz)) return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
        data.timezone = tz;
    }
    if (body.model !== undefined) {
        data.model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : null;
    }
    if (body.enabledTools !== undefined) data.enabledTools = sanitizeTools(body.enabledTools);
    if (typeof body.notify === "boolean") data.notify = body.notify;
    if (typeof body.saveToChat === "boolean") data.saveToChat = body.saveToChat;
    if (typeof body.active === "boolean") data.active = body.active;

    // Recompute nextRunAt whenever schedule/timezone/active change.
    const nextSchedule = (data.schedule as string) ?? agent.schedule;
    const nextTz = (data.timezone as string) ?? agent.timezone;
    const nextActive = data.active !== undefined ? (data.active as boolean) : agent.active;
    if (
        data.schedule !== undefined ||
        data.timezone !== undefined ||
        data.active !== undefined
    ) {
        data.nextRunAt = nextActive ? getNextRun(nextSchedule, nextTz) : null;
    }

    const updated = await prisma.scheduledAgent.update({ where: { id }, data });
    return NextResponse.json({ ...updated, scheduleLabel: describeCron(updated.schedule) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const agent = await getOwned(id, session.user.id);
    if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.scheduledAgent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
}
