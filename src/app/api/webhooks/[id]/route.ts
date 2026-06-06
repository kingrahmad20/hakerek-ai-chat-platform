import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSafeUrl, SsrfError } from "@/lib/ssrf";

export const dynamic = "force-dynamic";

const VALID_EVENTS = ["chat.created", "chat.updated", "chat.deleted", "message.created", "scheduled_agent.completed"];

async function getOwnedWebhook(id: string, userId: string) {
    const webhook = await prisma.webhook.findUnique({ where: { id }, select: { userId: true } });
    if (!webhook || webhook.userId !== userId) return null;
    return webhook;
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const owned = await getOwnedWebhook(id, session.user.id);
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const webhook = await prisma.webhook.findUnique({
        where: { id },
        include: {
            deliveries: {
                orderBy: { createdAt: "desc" },
                take: 20,
                select: { id: true, event: true, status: true, success: true, createdAt: true },
            },
        },
    });

    return NextResponse.json(webhook);
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const owned = await getOwnedWebhook(id, session.user.id);
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = String(body.name).trim().slice(0, 60);
    if (body.url !== undefined) {
        if (!String(body.url).startsWith("https://")) {
            return NextResponse.json({ error: "URL must start with https://" }, { status: 400 });
        }
        try {
            await assertSafeUrl(String(body.url));
        } catch (err) {
            if (err instanceof SsrfError) {
                return NextResponse.json({ error: err.message }, { status: 400 });
            }
            return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
        }
        data.url = body.url;
    }
    if (body.events !== undefined) {
        if (!Array.isArray(body.events) || body.events.length === 0) {
            return NextResponse.json({ error: "At least one event is required" }, { status: 400 });
        }
        const invalid = body.events.filter((e: string) => !VALID_EVENTS.includes(e));
        if (invalid.length > 0) {
            return NextResponse.json({ error: `Invalid events: ${invalid.join(", ")}` }, { status: 400 });
        }
        data.events = body.events;
    }
    if (typeof body.active === "boolean") data.active = body.active;

    const updated = await prisma.webhook.update({ where: { id }, data });
    return NextResponse.json(updated);
}

export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const owned = await getOwnedWebhook(id, session.user.id);
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.webhook.delete({ where: { id } });
    return NextResponse.json({ ok: true });
}
