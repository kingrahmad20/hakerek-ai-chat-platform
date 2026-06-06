import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeFetch } from "@/lib/ssrf";

export const dynamic = "force-dynamic";

export async function POST(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook || webhook.userId !== session.user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = JSON.stringify({
        event: "webhook.test",
        data: { message: "This is a test delivery from Hakerek" },
        timestamp: new Date().toISOString(),
    });

    const signature = createHmac("sha256", webhook.secret).update(body).digest("hex");
    let status = 0;
    let success = false;
    let error: string | null = null;

    try {
        const res = await safeFetch(webhook.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Signature": `sha256=${signature}`,
                "X-Webhook-Event": "webhook.test",
            },
            body,
            maxRedirects: 0,
        });
        status = res.status;
        success = res.ok;
    } catch (err) {
        error = String(err);
    }

    return NextResponse.json({ success, status, error });
}
