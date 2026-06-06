import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSafeUrl, SsrfError } from "@/lib/ssrf";

export const dynamic = "force-dynamic";

const VALID_EVENTS = ["chat.created", "chat.updated", "chat.deleted", "message.created", "scheduled_agent.completed"];

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const webhooks = await prisma.webhook.findMany({
        where: { userId: session.user.id },
        select: {
            id: true, name: true, url: true, events: true,
            active: true, createdAt: true, updatedAt: true,
            _count: { select: { deliveries: true } },
        },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(webhooks);
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
    const { name, url, events } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!url?.startsWith("https://")) {
        return NextResponse.json({ error: "URL must start with https://" }, { status: 400 });
    }
    // Reject URLs that point at private/internal addresses (SSRF). Delivery is
    // re-validated at send time too, in case DNS changes after creation.
    try {
        await assertSafeUrl(url);
    } catch (err) {
        if (err instanceof SsrfError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    if (!Array.isArray(events) || events.length === 0) {
        return NextResponse.json({ error: "At least one event is required" }, { status: 400 });
    }
    const invalid = events.filter((e: string) => !VALID_EVENTS.includes(e));
    if (invalid.length > 0) {
        return NextResponse.json({ error: `Invalid events: ${invalid.join(", ")}` }, { status: 400 });
    }

    const count = await prisma.webhook.count({ where: { userId: session.user.id } });
    if (count >= 20) {
        return NextResponse.json({ error: "Maximum 20 webhooks allowed" }, { status: 400 });
    }

    const secret = randomBytes(24).toString("hex");
    const webhook = await prisma.webhook.create({
        data: {
            userId: session.user.id,
            name: name.trim().slice(0, 60),
            url,
            secret,
            events,
        },
        select: { id: true, name: true, url: true, secret: true, events: true, active: true, createdAt: true },
    });

    return NextResponse.json(webhook, { status: 201 });
}
