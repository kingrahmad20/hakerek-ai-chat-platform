import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail, isSmtpConfigured } from "@/lib/email";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    if (!await rateLimit(`forgot:${ip}`, 5, 60 * 60 * 1000)) {
        return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi nanti." }, { status: 429 });
    }

    const { email } = await req.json();
    const normalized = email?.trim().toLowerCase();
    if (!normalized || !EMAIL_RE.test(normalized)) {
        return NextResponse.json({ error: "Email tidak valid" }, { status: 400 });
    }

    // Check SMTP first (not user-specific, safe to reveal)
    const smtpReady = await isSmtpConfigured();
    if (!smtpReady) {
        return NextResponse.json({ error: "SMTP belum dikonfigurasi. Hubungi administrator." }, { status: 503 });
    }

    // Always return success after SMTP check to prevent email enumeration
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user || !user.password) {
        return NextResponse.json({ ok: true });
    }

    // Delete old reset tokens for this user
    await prisma.verificationToken.deleteMany({ where: { identifier: `reset:${user.email}` } });

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await prisma.verificationToken.create({
        data: { identifier: `reset:${user.email}`, token, expires },
    });

    try {
        await sendPasswordResetEmail(user.email!, token);
        logger.info("password_reset_requested", { userId: user.id });
    } catch (err) {
        logger.error("password_reset_email_failed", { userId: user.id, error: String(err) });
        return NextResponse.json({ error: "Gagal mengirim email. Coba lagi nanti." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
