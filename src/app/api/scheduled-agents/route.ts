import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCron, getNextRun, describeCron } from "@/lib/cron";

export const dynamic = "force-dynamic";

const MAX_AGENTS = 25;
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

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const agents = await prisma.scheduledAgent.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        select: {
            id: true, name: true, prompt: true, schedule: true, timezone: true,
            model: true, enabledTools: true, notify: true, saveToChat: true,
            chatId: true, active: true, nextRunAt: true, lastRunAt: true,
            lastStatus: true, lastError: true, lastResult: true, runCount: true,
            createdAt: true,
        },
    });

    return NextResponse.json(agents.map((a) => ({ ...a, scheduleLabel: describeCron(a.schedule) })));
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const name = String(body.name ?? "").trim();
    const prompt = String(body.prompt ?? "").trim();
    const schedule = String(body.schedule ?? "").trim();
    const timezone = String(body.timezone ?? "UTC").trim() || "UTC";

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    if (prompt.length > 8000) return NextResponse.json({ error: "Prompt is too long (max 8000 chars)" }, { status: 400 });
    if (!isValidCron(schedule)) return NextResponse.json({ error: "Invalid schedule (cron) expression" }, { status: 400 });
    if (!isValidTimezone(timezone)) return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });

    const count = await prisma.scheduledAgent.count({ where: { userId: session.user.id } });
    if (count >= MAX_AGENTS) {
        return NextResponse.json({ error: `Maximum ${MAX_AGENTS} scheduled agents allowed` }, { status: 400 });
    }

    const active = body.active !== false;
    const agent = await prisma.scheduledAgent.create({
        data: {
            userId: session.user.id,
            name: name.slice(0, 80),
            prompt,
            schedule,
            timezone,
            model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : null,
            enabledTools: sanitizeTools(body.enabledTools),
            notify: body.notify !== false,
            saveToChat: body.saveToChat === true,
            active,
            nextRunAt: active ? getNextRun(schedule, timezone) : null,
        },
    });

    return NextResponse.json({ ...agent, scheduleLabel: describeCron(agent.schedule) }, { status: 201 });
}
