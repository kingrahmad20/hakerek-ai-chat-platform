import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    if (!await rateLimit(`reset:${ip}`, 10, 15 * 60 * 1000)) {
        return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi nanti." }, { status: 429 });
    }

    const { token, password } = await req.json();

    if (!token || !password) {
        return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 });
    }
    if (password.length < 8) {
        return NextResponse.json({ error: "Password minimal 8 karakter" }, { status: 400 });
    }

    // Delete-first pattern: atomically consume the token to prevent reuse race conditions
    let record: { identifier: string; expires: Date } | null = null;
    try {
        record = await prisma.verificationToken.delete({ where: { token } });
    } catch {
        return NextResponse.json({ error: "Link tidak valid atau sudah digunakan" }, { status: 400 });
    }

    if (!record.identifier.startsWith("reset:")) {
        return NextResponse.json({ error: "Link tidak valid atau sudah digunakan" }, { status: 400 });
    }
    if (record.expires < new Date()) {
        return NextResponse.json({ error: "Link sudah kedaluwarsa. Minta reset password baru." }, { status: 400 });
    }

    const email = record.identifier.slice("reset:".length);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 });
    }

    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed, tokenVersion: { increment: 1 } } });

    logger.info("password_reset_success", { userId: user.id });
    return NextResponse.json({ ok: true });
}
