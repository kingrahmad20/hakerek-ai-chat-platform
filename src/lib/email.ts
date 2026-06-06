import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

interface SendMailOptions {
    to: string;
    subject: string;
    html: string;
}

async function getSmtpConfig() {
    const settings = await prisma.setting.findMany({
        where: { key: { in: ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from", "smtp_secure"] } },
    });
    const get = (key: string) => settings.find(s => s.key === key)?.value || "";
    return {
        host: get("smtp_host"),
        port: parseInt(get("smtp_port") || "587"),
        user: get("smtp_user"),
        pass: get("smtp_pass"),
        from: get("smtp_from") || get("smtp_user"),
        secure: get("smtp_secure") === "true",
    };
}

export async function isSmtpConfigured(): Promise<boolean> {
    const cfg = await getSmtpConfig();
    return !!(cfg.host && cfg.user && cfg.pass);
}

export async function sendEmail({ to, subject, html }: SendMailOptions): Promise<void> {
    const cfg = await getSmtpConfig();
    if (!cfg.host || !cfg.user || !cfg.pass) {
        throw new Error("SMTP not configured. Set it up in Admin → Settings.");
    }
    const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass },
    });
    await transporter.sendMail({ from: `"Hakerek" <${cfg.from}>`, to, subject, html });
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function baseUrl(): string {
    return process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000";
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const url = `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    await sendEmail({
        to: email,
        subject: "Reset Password — Hakerek",
        html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#111827;color:#f9fafb;border-radius:12px">
                <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">Reset Password</h1>
                <p style="color:#9ca3af;margin-bottom:24px">We received a password reset request for your Hakerek account.</p>
                <a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">Reset Password</a>
                <p style="color:#6b7280;font-size:13px;margin-top:24px">This link is valid for <strong>1 hour</strong>. If you did not request a password reset, ignore this email.</p>
                <p style="color:#6b7280;font-size:12px;margin-top:8px;word-break:break-all">${url}</p>
            </div>`,
    });
}

export async function sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
    const url = `${baseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
    await sendEmail({
        to: email,
        subject: "Email Verification — Hakerek",
        html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#111827;color:#f9fafb;border-radius:12px">
                <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">Verify Your Email</h1>
                <p style="color:#9ca3af;margin-bottom:4px">Hello, <strong style="color:#f9fafb">${escapeHtml(name)}</strong>!</p>
                <p style="color:#9ca3af;margin-bottom:24px">Click the button below to activate your Hakerek account.</p>
                <a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">Verify Email</a>
                <p style="color:#6b7280;font-size:13px;margin-top:24px">This link is valid for <strong>24 hours</strong>.</p>
                <p style="color:#6b7280;font-size:12px;margin-top:8px;word-break:break-all">${url}</p>
            </div>`,
    });
}
