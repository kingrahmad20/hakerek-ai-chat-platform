import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyTurnstile } from "@/lib/turnstile";
import { sendVerificationEmail, isSmtpConfigured } from "@/lib/email";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    if (!await rateLimit(`register:${ip}`, 10, 60 * 60 * 1000)) {
        return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const { name, email, password, turnstileToken } = await req.json();

    if (!name || !email || !password) {
        return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }
    if (password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Fetch relevant settings in one query
    const settings = await prisma.setting.findMany({
        where: { key: { in: ["turnstileEnabled", "turnstileSecretKey", "emailVerificationRequired"] } },
    });
    const getSetting = (key: string) => settings.find(s => s.key === key)?.value;

    // Turnstile verification
    if (getSetting("turnstileEnabled") === "true") {
        const secretKey = getSetting("turnstileSecretKey") || "";
        const ok = await verifyTurnstile(turnstileToken || "", secretKey);
        if (!ok) {
            return NextResponse.json({ error: "Turnstile verification failed. Please try again." }, { status: 400 });
        }
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);

    // First-ever user becomes the platform admin (initial setup). They are
    // created as ADMIN with email verification skipped so they can sign in
    // immediately and reach the admin panel.
    //
    // To avoid a race where two concurrent first registrations both become
    // admin, the admin slot is claimed atomically inside a transaction by
    // inserting the unique `adminInitialized` Setting row. The DB unique
    // constraint on `Setting.key` guarantees only one request can win; the
    // loser falls back to creating a normal USER.
    const createUser = (asAdmin: boolean) =>
        prisma.$transaction(async (tx) => {
            if (asAdmin) {
                await tx.setting.create({ data: { key: "adminInitialized", value: "true" } });
            }
            return tx.user.create({
                data: {
                    name,
                    email,
                    password: hashed,
                    role: asAdmin ? "ADMIN" : "USER",
                    ...(asAdmin ? { emailVerified: new Date() } : {}),
                },
            });
        });

    let isFirstUser = (await prisma.user.count()) === 0;
    let user;
    try {
        user = await createUser(isFirstUser);
    } catch (err) {
        // P2002 = unique constraint violation on `adminInitialized`: another
        // concurrent registration already claimed admin, so retry as a USER.
        if (isFirstUser && (err as { code?: string }).code === "P2002") {
            isFirstUser = false;
            user = await createUser(false);
        } else {
            throw err;
        }
    }

    logger.info("auth_register_success", { userId: user.id, isFirstUser });

    // Email verification (skipped entirely for the first admin/setup user)
    const verificationRequired = !isFirstUser && getSetting("emailVerificationRequired") === "true";
    const smtpReady = verificationRequired && (await isSmtpConfigured());

    if (verificationRequired && smtpReady) {
        // Clean up old tokens, create new one
        await prisma.verificationToken.deleteMany({ where: { identifier: `verify:${email}` } });
        const token = crypto.randomUUID();
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await prisma.verificationToken.create({ data: { identifier: `verify:${email}`, token, expires } });

        try {
            await sendVerificationEmail(email, name, token);
            return NextResponse.json({ success: true, requiresVerification: true });
        } catch (err) {
            logger.error("verification_email_failed", { userId: user.id, error: String(err) });
            // Registration succeeded but email failed — let user in anyway
            return NextResponse.json({ success: true, emailFailed: true });
        }
    }

    return NextResponse.json({ success: true, isAdmin: isFirstUser });
}
