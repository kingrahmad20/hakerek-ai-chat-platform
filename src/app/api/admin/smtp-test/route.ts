import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { host, port, user, pass, secure } = await req.json();

    if (!host || !user || !pass) {
        return NextResponse.json({ error: "Host, username, dan password wajib diisi." }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
        host,
        port: parseInt(port) || 587,
        secure: secure === true || secure === "true",
        auth: { user, pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
    });

    try {
        await transporter.verify();
        return NextResponse.json({ ok: true, message: "Koneksi SMTP berhasil! Server siap mengirim email." });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ ok: false, error: msg }, { status: 200 });
    }
}
