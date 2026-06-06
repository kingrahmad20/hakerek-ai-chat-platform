"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import type { PlatformRole } from "@/types";

export type ActionResult = { ok: boolean; message: string } | null;

/** Requires caller to have one of the specified roles; redirects to "/" otherwise. */
async function requireRole(...roles: PlatformRole[]) {
    const sess = await getServerSession(authOptions);
    if (!sess || !roles.includes(sess.user?.role as PlatformRole)) redirect("/");
    return sess;
}

/** Shorthand: full ADMIN only. */
function requireAdmin() {
    return requireRole("ADMIN");
}

/** Shorthand: ADMIN or user_manager. */
function requireUserManager() {
    return requireRole("ADMIN", "user_manager");
}

/** Shorthand: ADMIN or content_moderator. */
function requireContentModerator() {
    return requireRole("ADMIN", "content_moderator");
}

/** Shorthand: ADMIN or billing_admin. */
function requireBillingAdmin() {
    return requireRole("ADMIN", "billing_admin");
}

async function logAudit(
    actorId: string,
    action: string,
    opts?: { targetType?: string; targetId?: string; targetLabel?: string; metadata?: Record<string, unknown> },
) {
    try {
        await prisma.auditLog.create({
            data: {
                actorId,
                action,
                targetType: opts?.targetType,
                targetId: opts?.targetId,
                targetLabel: opts?.targetLabel,
                metadata: opts?.metadata ? JSON.stringify(opts.metadata) : undefined,
            },
        });
    } catch {
        // Non-critical — don't fail the main action if audit write fails
    }
}

// ── App Identity ─────────────────────────────────────────────────────────────

export async function saveAppSettings(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const appName = ((fd.get("appName") as string) ?? "").trim().slice(0, 100) || "Hakerek";
        const appDescription = ((fd.get("appDescription") as string) ?? "").trim().slice(0, 300);
        for (const [key, value] of [["appName", appName], ["appDescription", appDescription]] as const) {
            await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
        }
        await logAudit(sess.user.id, "UPDATE_APP_SETTINGS", { metadata: { appName } });
        revalidatePath("/admin");
        revalidatePath("/", "layout");
        return { ok: true, message: "App settings saved." };
    } catch {
        return { ok: false, message: "Failed to save app settings." };
    }
}

// ── Model config ──────────────────────────────────────────────────────────────

export async function saveModelConfig(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const defaultModel = fd.get("defaultModel") as string;
        const fallbacks = fd.getAll("fallbackModels").join(",");
        for (const [key, value] of [["defaultModel", defaultModel], ["fallbackModels", fallbacks]] as const) {
            await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
        }
        await logAudit(sess.user.id, "UPDATE_MODEL_CONFIG", { metadata: { defaultModel, fallbacks } });
        revalidatePath("/admin");
        return { ok: true, message: "Model configuration saved." };
    } catch {
        return { ok: false, message: "Failed to save model configuration." };
    }
}

export async function saveMultiModelConfig(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const enabled = fd.has("multiModelEnabled") ? "true" : "false";
        const allowedModels = fd.getAll("allowedModels").join(",");
        for (const [key, value] of [["multiModelEnabled", enabled], ["allowedModels", allowedModels]] as const) {
            await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
        }
        await logAudit(sess.user.id, "UPDATE_MULTI_MODEL_CONFIG", { metadata: { enabled } });
        revalidatePath("/admin");
        return { ok: true, message: enabled === "true" ? "User model selection enabled." : "User model selection disabled." };
    } catch {
        return { ok: false, message: "Failed to save multi-model settings." };
    }
}

// ── SMTP ──────────────────────────────────────────────────────────────────────

export async function saveSMTP(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const keys = ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from", "smtp_secure"];
        for (const key of keys) {
            const value = (fd.get(key) as string) ?? "";
            await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
        }
        await logAudit(sess.user.id, "UPDATE_SMTP", {
            targetType: "setting",
            metadata: { host: fd.get("smtp_host"), port: fd.get("smtp_port") },
        });
        revalidatePath("/admin");
        return { ok: true, message: "SMTP configuration saved." };
    } catch {
        return { ok: false, message: "Failed to save SMTP configuration." };
    }
}

// ── Admin password change ─────────────────────────────────────────────────────

export async function changePassword(fd: FormData) {
    const sess = await getServerSession(authOptions);
    if (!sess) redirect("/api/auth/signin");

    const current = fd.get("currentPassword") as string;
    const newPass = fd.get("newPassword") as string;
    const confirm = fd.get("confirmPassword") as string;

    if (newPass !== confirm) redirect("/admin?tab=settings&error=mismatch");
    if (newPass.length < 8) redirect("/admin?tab=settings&error=tooshort");

    const user = await prisma.user.findUnique({ where: { email: sess.user.email! } });
    if (!user?.password) redirect("/admin?tab=settings&error=nopassword");

    const valid = await bcrypt.compare(current, user.password);
    if (!valid) redirect("/admin?tab=settings&error=invalid");

    const hashed = await bcrypt.hash(newPass, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed, tokenVersion: { increment: 1 } } });
    await logAudit(user.id, "CHANGE_PASSWORD");
    redirect("/admin?tab=settings&success=password");
}

// ── User management ───────────────────────────────────────────────────────────

export async function assignPlatformRole(fd: FormData) {
    const sess = await requireAdmin();
    const userId = fd.get("userId") as string;
    const newRole = fd.get("role") as PlatformRole;
    const allowedRoles: PlatformRole[] = ["USER", "ADMIN", "user_manager", "content_moderator", "billing_admin"];
    if (!allowedRoles.includes(newRole)) return;
    if (userId === sess.user.id) return;
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, role: true } });
    await prisma.user.update({ where: { id: userId }, data: { role: newRole } });
    await logAudit(sess.user.id, "ASSIGN_PLATFORM_ROLE", {
        targetType: "user",
        targetId: userId,
        targetLabel: target?.email || userId,
        metadata: { from: target?.role, to: newRole },
    });
    revalidatePath("/admin");
}

export async function banUser(fd: FormData) {
    const sess = await requireUserManager();
    const userId = fd.get("userId") as string;
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, role: true } });
    if (target?.role === "ADMIN" && sess.user.role !== "ADMIN") return;
    await prisma.user.update({ where: { id: userId }, data: { banned: true } });
    await logAudit(sess.user.id, "BAN_USER", {
        targetType: "user",
        targetId: userId,
        targetLabel: target?.email || userId,
    });
    revalidatePath("/admin");
}

export async function unbanUser(fd: FormData) {
    const sess = await requireUserManager();
    const userId = fd.get("userId") as string;
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    await prisma.user.update({ where: { id: userId }, data: { banned: false } });
    await logAudit(sess.user.id, "UNBAN_USER", {
        targetType: "user",
        targetId: userId,
        targetLabel: target?.email || userId,
    });
    revalidatePath("/admin");
}

export async function promoteUser(fd: FormData) {
    const sess = await requireAdmin(); // promote/demote to ADMIN requires full ADMIN
    const userId = fd.get("userId") as string;
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
    await logAudit(sess.user.id, "PROMOTE_USER", {
        targetType: "user",
        targetId: userId,
        targetLabel: target?.email || userId,
    });
    revalidatePath("/admin");
}

export async function demoteUser(fd: FormData) {
    const sess = await requireAdmin();
    const userId = fd.get("userId") as string;
    if (userId === sess.user.id) return;
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    await prisma.user.update({ where: { id: userId }, data: { role: "USER" } });
    await logAudit(sess.user.id, "DEMOTE_USER", {
        targetType: "user",
        targetId: userId,
        targetLabel: target?.email || userId,
    });
    revalidatePath("/admin");
}

export async function deleteUser(fd: FormData) {
    const sess = await requireUserManager();
    const userId = fd.get("userId") as string;
    if (userId === sess.user.id) return;
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, role: true } });
    if (target?.role === "ADMIN" && sess.user.role !== "ADMIN") return;
    await prisma.user.delete({ where: { id: userId } });
    await logAudit(sess.user.id, "DELETE_USER", {
        targetType: "user",
        targetId: userId,
        targetLabel: target?.email || userId,
    });
    revalidatePath("/admin");
}

export async function bulkDeleteUsers(fd: FormData) {
    const sess = await requireUserManager();
    let userIds = (fd.getAll("userId") as string[]).filter((id) => id !== sess.user.id);
    if (userIds.length === 0) return;
    if (sess.user.role !== "ADMIN") {
        const targets = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, role: true } });
        const adminIds = new Set(targets.filter((t) => t.role === "ADMIN").map((t) => t.id));
        userIds = userIds.filter((id) => !adminIds.has(id));
    }
    if (userIds.length === 0) return;
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await logAudit(sess.user.id, "BULK_DELETE_USERS", { metadata: { count: userIds.length } });
    revalidatePath("/admin");
}

export async function bulkBanUsers(fd: FormData) {
    const sess = await requireUserManager();
    let userIds = (fd.getAll("userId") as string[]).filter((id) => id !== sess.user.id);
    if (userIds.length === 0) return;
    if (sess.user.role !== "ADMIN") {
        const targets = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, role: true } });
        const adminIds = new Set(targets.filter((t) => t.role === "ADMIN").map((t) => t.id));
        userIds = userIds.filter((id) => !adminIds.has(id));
    }
    if (userIds.length === 0) return;
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { banned: true } });
    await logAudit(sess.user.id, "BULK_BAN_USERS", { metadata: { count: userIds.length } });
    revalidatePath("/admin");
}

export async function bulkUnbanUsers(fd: FormData) {
    const sess = await requireUserManager();
    const userIds = fd.getAll("userId") as string[];
    if (userIds.length === 0) return;
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { banned: false } });
    await logAudit(sess.user.id, "BULK_UNBAN_USERS", { metadata: { count: userIds.length } });
    revalidatePath("/admin");
}

export async function deleteChat(fd: FormData) {
    const sess = await requireContentModerator();
    const chatId = fd.get("chatId") as string;
    const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { title: true } });
    await prisma.chat.delete({ where: { id: chatId } });
    await logAudit(sess.user.id, "DELETE_CHAT", {
        targetType: "chat",
        targetId: chatId,
        targetLabel: chat?.title || chatId,
    });
    revalidatePath("/admin");
}

export async function bulkDeleteChats(fd: FormData) {
    const sess = await requireContentModerator();
    const chatIds = fd.getAll("chatId") as string[];
    if (chatIds.length === 0) return;
    await prisma.chat.deleteMany({ where: { id: { in: chatIds } } });
    await logAudit(sess.user.id, "BULK_DELETE_CHATS", { metadata: { count: chatIds.length } });
    revalidatePath("/admin");
}

// ── API Keys ──────────────────────────────────────────────────────────────────

export interface StoredApiKey { id: string; label: string; key: string; active: boolean }

async function readApiKeys(): Promise<StoredApiKey[]> {
    const raw = await prisma.setting.findUnique({ where: { key: "apiKeys" } });
    if (!raw) return [];
    try { return JSON.parse(raw.value); } catch { return []; }
}

async function writeApiKeys(keys: StoredApiKey[]) {
    await prisma.setting.upsert({
        where: { key: "apiKeys" },
        update: { value: JSON.stringify(keys) },
        create: { key: "apiKeys", value: JSON.stringify(keys) },
    });
    const active = keys.find((k) => k.active);
    if (active) {
        await prisma.setting.upsert({
            where: { key: "openRouterApiKey" },
            update: { value: active.key },
            create: { key: "openRouterApiKey", value: active.key },
        });
    }
}

export async function addApiKey(fd: FormData) {
    const sess = await requireBillingAdmin();
    const label = (fd.get("label") as string)?.trim();
    const key = (fd.get("key") as string)?.trim();
    if (!label || !key) return;
    const keys = await readApiKeys();
    keys.push({ id: crypto.randomUUID(), label, key, active: keys.length === 0 });
    await writeApiKeys(keys);
    await logAudit(sess.user.id, "ADD_API_KEY", { targetType: "api_key", targetLabel: label });
    revalidatePath("/admin");
}

export async function deleteApiKey(fd: FormData) {
    const sess = await requireBillingAdmin();
    const keyId = fd.get("keyId") as string;
    let keys = await readApiKeys();
    const target = keys.find((k) => k.id === keyId);
    const wasActive = target?.active ?? false;
    keys = keys.filter((k) => k.id !== keyId);
    if (wasActive && keys.length > 0) keys[0].active = true;
    await writeApiKeys(keys);
    await logAudit(sess.user.id, "DELETE_API_KEY", {
        targetType: "api_key",
        targetId: keyId,
        targetLabel: target?.label,
        metadata: { wasActive },
    });
    revalidatePath("/admin");
}

export async function setActiveApiKey(fd: FormData) {
    const sess = await requireBillingAdmin();
    const keyId = fd.get("keyId") as string;
    const keys = await readApiKeys();
    const target = keys.find((k) => k.id === keyId);
    keys.forEach((k) => { k.active = k.id === keyId; });
    await writeApiKeys(keys);
    await logAudit(sess.user.id, "SET_ACTIVE_API_KEY", {
        targetType: "api_key",
        targetId: keyId,
        targetLabel: target?.label,
    });
    revalidatePath("/admin");
}

// ── Email settings ────────────────────────────────────────────────────────────

export async function saveEmailSettings(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const enabled = fd.has("emailVerificationRequired") ? "true" : "false";
        await prisma.setting.upsert({
            where: { key: "emailVerificationRequired" },
            update: { value: enabled },
            create: { key: "emailVerificationRequired", value: enabled },
        });
        await logAudit(sess.user.id, "UPDATE_EMAIL_SETTINGS", { metadata: { emailVerificationRequired: enabled } });
        revalidatePath("/admin");
        return { ok: true, message: "Email settings saved." };
    } catch {
        return { ok: false, message: "Failed to save email settings." };
    }
}

// ── Cloudflare Turnstile ──────────────────────────────────────────────────────

export async function saveTurnstile(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const siteKey = (fd.get("siteKey") as string)?.trim() || "";
        const secretKey = (fd.get("secretKey") as string)?.trim() || "";
        const enabled = fd.has("enabled") ? "true" : "false";

        if (enabled === "true" && (!siteKey || !secretKey)) {
            await prisma.setting.upsert({ where: { key: "turnstileEnabled" }, update: { value: "false" }, create: { key: "turnstileEnabled", value: "false" } });
            revalidatePath("/admin");
            return { ok: false, message: "Turnstile disabled because Site Key or Secret Key is empty." };
        }

        await prisma.setting.upsert({ where: { key: "turnstileEnabled" }, update: { value: enabled }, create: { key: "turnstileEnabled", value: enabled } });
        for (const [key, value] of [["turnstileSiteKey", siteKey], ["turnstileSecretKey", secretKey]] as const) {
            await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
        }
        await logAudit(sess.user.id, "UPDATE_TURNSTILE", { metadata: { enabled } });
        revalidatePath("/admin");
        return { ok: true, message: "Turnstile settings saved." };
    } catch {
        return { ok: false, message: "Failed to save Turnstile settings." };
    }
}

// ── Google OAuth ──────────────────────────────────────────────────────────────

export async function saveGoogleOAuth(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const clientId = (fd.get("googleClientId") as string)?.trim() || "";
        const clientSecret = (fd.get("googleClientSecret") as string)?.trim() || "";
        const enabled = fd.has("googleEnabled") ? "true" : "false";

        if (enabled === "true" && (!clientId || !clientSecret)) {
            await prisma.setting.upsert({ where: { key: "googleEnabled" }, update: { value: "false" }, create: { key: "googleEnabled", value: "false" } });
            revalidatePath("/admin");
            return { ok: false, message: "Google OAuth disabled because Client ID or Secret is empty." };
        }

        await prisma.setting.upsert({ where: { key: "googleEnabled" }, update: { value: enabled }, create: { key: "googleEnabled", value: enabled } });
        for (const [key, value] of [["googleClientId", clientId], ["googleClientSecret", clientSecret]] as const) {
            await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
        }
        await logAudit(sess.user.id, "UPDATE_GOOGLE_OAUTH", { metadata: { enabled } });
        revalidatePath("/admin");
        return { ok: true, message: "Google OAuth settings saved." };
    } catch {
        return { ok: false, message: "Failed to save Google OAuth settings." };
    }
}

// ── OIDC SSO ──────────────────────────────────────────────────────────────────

export async function saveOidcSso(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const name = (fd.get("oidcName") as string)?.trim() || "";
        const issuer = (fd.get("oidcIssuer") as string)?.trim() || "";
        const clientId = (fd.get("oidcClientId") as string)?.trim() || "";
        const clientSecret = (fd.get("oidcClientSecret") as string)?.trim() || "";
        const enabled = fd.has("oidcEnabled") ? "true" : "false";

        if (enabled === "true" && (!issuer || !clientId || !clientSecret)) {
            await prisma.setting.upsert({ where: { key: "oidcEnabled" }, update: { value: "false" }, create: { key: "oidcEnabled", value: "false" } });
            revalidatePath("/admin");
            return { ok: false, message: "SSO disabled because Issuer URL, Client ID, or Secret is empty." };
        }

        await prisma.setting.upsert({ where: { key: "oidcEnabled" }, update: { value: enabled }, create: { key: "oidcEnabled", value: enabled } });
        for (const [key, value] of [["oidcName", name], ["oidcIssuer", issuer], ["oidcClientId", clientId], ["oidcClientSecret", clientSecret]] as const) {
            await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
        }
        await logAudit(sess.user.id, "UPDATE_OIDC_SSO", { metadata: { enabled } });
        revalidatePath("/admin");
        return { ok: true, message: "SSO settings saved." };
    } catch {
        return { ok: false, message: "Failed to save SSO settings." };
    }
}

// ── Per-user Quota ────────────────────────────────────────────────────────────

export async function setUserQuota(fd: FormData) {
    const sess = await requireBillingAdmin();
    const userId = fd.get("userId") as string;
    if (!userId) return;

    const msgRaw = (fd.get("monthlyMessageQuota") as string)?.trim();
    const tokenRaw = (fd.get("monthlyTokenQuota") as string)?.trim();

    const monthlyMessageQuota = msgRaw ? Math.max(1, parseInt(msgRaw) || 1) : null;
    const monthlyTokenQuota = tokenRaw ? Math.max(1, parseInt(tokenRaw) || 1) : null;

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    await prisma.user.update({ where: { id: userId }, data: { monthlyMessageQuota, monthlyTokenQuota } });
    await logAudit(sess.user.id, "SET_USER_QUOTA", {
        targetType: "user",
        targetId: userId,
        targetLabel: target?.email || userId,
        metadata: { monthlyMessageQuota, monthlyTokenQuota },
    });
    revalidatePath("/admin");
}

// ── Rate Limiting ─────────────────────────────────────────────────────────────

export async function saveRateLimit(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const value = (fd.get("rateLimitPerDay") as string)?.trim() || "0";
        const parsed = Math.max(0, parseInt(value) || 0);
        await prisma.setting.upsert({
            where: { key: "rateLimitPerDay" },
            update: { value: String(parsed) },
            create: { key: "rateLimitPerDay", value: String(parsed) },
        });
        await logAudit(sess.user.id, "UPDATE_RATE_LIMIT", { metadata: { rateLimitPerDay: parsed } });
        revalidatePath("/admin");
        return { ok: true, message: parsed === 0 ? "Rate limit disabled." : `Rate limit set to ${parsed} messages/day.` };
    } catch {
        return { ok: false, message: "Failed to save rate limit." };
    }
}

// ── File Upload ───────────────────────────────────────────────────────────────

export async function saveFileSettings(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const enabled = fd.has("allowFileUpload") ? "true" : "false";
        await prisma.setting.upsert({
            where: { key: "allowFileUpload" },
            update: { value: enabled },
            create: { key: "allowFileUpload", value: enabled },
        });
        await logAudit(sess.user.id, "UPDATE_FILE_SETTINGS", { metadata: { allowFileUpload: enabled } });
        revalidatePath("/admin");
        return { ok: true, message: enabled === "true" ? "File upload enabled." : "File upload disabled." };
    } catch {
        return { ok: false, message: "Failed to save file upload settings." };
    }
}

// ── Voice (Speech-to-Text / Text-to-Speech) ────────────────────────────────────

export async function saveVoiceSettings(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const sttEnabled = fd.has("sttEnabled") ? "true" : "false";
        const ttsEnabled = fd.has("ttsEnabled") ? "true" : "false";
        const ttsProvider = (fd.get("ttsProvider") as string) === "elevenlabs" ? "elevenlabs" : "openai";

        const entries: [string, string][] = [
            ["sttEnabled", sttEnabled],
            ["sttModel", ((fd.get("sttModel") as string) ?? "").trim() || "whisper-1"],
            ["sttLanguage", ((fd.get("sttLanguage") as string) ?? "").trim()],
            ["ttsEnabled", ttsEnabled],
            ["ttsProvider", ttsProvider],
            ["ttsModel", ((fd.get("ttsModel") as string) ?? "").trim() || "tts-1"],
            ["ttsVoice", ((fd.get("ttsVoice") as string) ?? "").trim() || "alloy"],
            ["elevenLabsVoiceId", ((fd.get("elevenLabsVoiceId") as string) ?? "").trim() || "21m00Tcm4TlvDq8ikWAM"],
            ["elevenLabsModelId", ((fd.get("elevenLabsModelId") as string) ?? "").trim() || "eleven_multilingual_v2"],
        ];

        // Only overwrite the ElevenLabs key when a new value is supplied, so an
        // empty field doesn't wipe an existing secret on every save.
        const elevenKey = ((fd.get("elevenLabsApiKey") as string) ?? "").trim();
        if (elevenKey) entries.push(["elevenLabsApiKey", elevenKey]);

        for (const [key, value] of entries) {
            await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
        }
        await logAudit(sess.user.id, "UPDATE_VOICE_SETTINGS", { metadata: { sttEnabled, ttsEnabled, ttsProvider } });
        revalidatePath("/admin");
        return { ok: true, message: "Voice settings saved." };
    } catch {
        return { ok: false, message: "Failed to save voice settings." };
    }
}

// ── AI Rules ──────────────────────────────────────────────────────────────────

export interface AiRule {
    id: string;
    title: string;
    content: string;
    enabled: boolean;
}

export async function saveAiRules(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const raw = fd.get("aiRules") as string;
        const parsed: AiRule[] = JSON.parse(raw);
        const rules = parsed.map(r => ({
            id: String(r.id),
            title: String(r.title).slice(0, 100),
            content: String(r.content).slice(0, 2000),
            enabled: Boolean(r.enabled),
        }));
        await prisma.setting.upsert({
            where: { key: "aiRules" },
            update: { value: JSON.stringify(rules) },
            create: { key: "aiRules", value: JSON.stringify(rules) },
        });
        await logAudit(sess.user.id, "UPDATE_AI_RULES", {
            metadata: { total: rules.length, enabled: rules.filter(r => r.enabled).length },
        });
        revalidatePath("/admin");
        return { ok: true, message: `${rules.filter(r => r.enabled).length} active rules saved.` };
    } catch {
        return { ok: false, message: "Failed to save AI rules." };
    }
}

// ── Slash Commands ────────────────────────────────────────────────────────────

export interface SlashCommand {
    id: string;
    command: string;
    description: string;
    prompt: string;
    enabled: boolean;
}

export async function saveSlashCommands(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const raw = fd.get("slashCommands") as string;
        const parsed: SlashCommand[] = JSON.parse(raw);
        const commands = parsed.map(c => ({
            id: String(c.id),
            command: String(c.command).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 50),
            description: String(c.description).slice(0, 150),
            prompt: String(c.prompt).slice(0, 2000),
            enabled: Boolean(c.enabled),
        }));
        await prisma.setting.upsert({
            where: { key: "slashCommands" },
            update: { value: JSON.stringify(commands) },
            create: { key: "slashCommands", value: JSON.stringify(commands) },
        });
        await logAudit(sess.user.id, "UPDATE_SLASH_COMMANDS", {
            metadata: { total: commands.length, enabled: commands.filter(c => c.enabled).length },
        });
        revalidatePath("/admin");
        revalidatePath("/");
        return { ok: true, message: `${commands.filter(c => c.enabled).length} active command(s) saved.` };
    } catch {
        return { ok: false, message: "Failed to save slash commands." };
    }
}

// ── Conversation Templates ─────────────────────────────────────────────────────

export interface ConversationTemplate {
    id: string;
    name: string;
    prompt: string;
    enabled: boolean;
}

export async function saveConversationTemplates(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const raw = fd.get("conversationTemplates") as string;
        const parsed: ConversationTemplate[] = JSON.parse(raw);
        const templates = parsed.map(t => ({
            id: String(t.id),
            name: String(t.name).slice(0, 100),
            prompt: String(t.prompt).slice(0, 2000),
            enabled: Boolean(t.enabled),
        }));
        await prisma.setting.upsert({
            where: { key: "conversationTemplates" },
            update: { value: JSON.stringify(templates) },
            create: { key: "conversationTemplates", value: JSON.stringify(templates) },
        });
        await logAudit(sess.user.id, "UPDATE_CONVERSATION_TEMPLATES", {
            metadata: { total: templates.length, enabled: templates.filter(t => t.enabled).length },
        });
        revalidatePath("/admin");
        revalidatePath("/");
        return { ok: true, message: `${templates.filter(t => t.enabled).length} active template(s) saved.` };
    } catch {
        return { ok: false, message: "Failed to save conversation templates." };
    }
}

// ── Personas ─────────────────────────────────────────────────────────────────

export interface Persona {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    enabled: boolean;
    /** Optional model ID override. Empty = use the platform default model. */
    model?: string;
    /** Knowledge bases bound to this assistant; always searched when it is active. */
    knowledgeBaseIds?: string[];
    /** Tool ids this assistant may use (built-in names + "mcp:<serverId>"). Empty = no tools. */
    toolIds?: string[];
}

export async function savePersonas(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const raw = fd.get("personas") as string;
        const parsed: Persona[] = JSON.parse(raw);
        const personas = parsed.map(p => ({
            id: String(p.id),
            name: String(p.name).slice(0, 100),
            description: String(p.description ?? "").slice(0, 200),
            systemPrompt: String(p.systemPrompt).slice(0, 4000),
            enabled: Boolean(p.enabled),
            model: p.model ? String(p.model).slice(0, 200) : "",
            knowledgeBaseIds: Array.isArray(p.knowledgeBaseIds)
                ? p.knowledgeBaseIds.filter((id): id is string => typeof id === "string").slice(0, 50)
                : [],
            toolIds: Array.isArray(p.toolIds)
                ? p.toolIds.filter((id): id is string => typeof id === "string").slice(0, 50)
                : [],
        }));
        await prisma.setting.upsert({
            where: { key: "personas" },
            update: { value: JSON.stringify(personas) },
            create: { key: "personas", value: JSON.stringify(personas) },
        });
        await logAudit(sess.user.id, "UPDATE_PERSONAS", {
            metadata: { total: personas.length, enabled: personas.filter(p => p.enabled).length },
        });
        revalidatePath("/admin");
        revalidatePath("/");
        return { ok: true, message: `${personas.filter(p => p.enabled).length} active persona(s) saved.` };
    } catch {
        return { ok: false, message: "Failed to save personas." };
    }
}

// ── Pages ─────────────────────────────────────────────────────────────────────

export interface PageItem {
    id: string;
    slug: string;
    title: string;
    content: string;
    published: boolean;
    createdAt: Date;
    updatedAt: Date;
}

function toSlug(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 100);
}

export async function createPage(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireContentModerator();
    try {
        const title = (fd.get("title") as string)?.trim().slice(0, 200);
        const rawSlug = (fd.get("slug") as string)?.trim();
        const content = (fd.get("content") as string) ?? "";
        const published = fd.has("published");

        if (!title) return { ok: false, message: "Title is required." };

        const slug = rawSlug ? toSlug(rawSlug) : toSlug(title);
        if (!slug) return { ok: false, message: "Invalid slug." };

        const existing = await prisma.page.findUnique({ where: { slug } });
        if (existing) return { ok: false, message: "A page with this slug already exists." };

        const page = await prisma.page.create({ data: { slug, title, content, published } });
        await logAudit(sess.user.id, "CREATE_PAGE", { targetType: "page", targetId: page.id, targetLabel: title });
        revalidatePath("/admin");
        revalidatePath(`/pages/${slug}`);
        return { ok: true, message: "Page created." };
    } catch {
        return { ok: false, message: "Failed to create page." };
    }
}

export async function updatePage(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireContentModerator();
    try {
        const id = fd.get("id") as string;
        const title = (fd.get("title") as string)?.trim().slice(0, 200);
        const rawSlug = (fd.get("slug") as string)?.trim();
        const content = (fd.get("content") as string) ?? "";
        const published = fd.has("published");

        if (!id) return { ok: false, message: "Page ID is required." };
        if (!title) return { ok: false, message: "Title is required." };

        const slug = rawSlug ? toSlug(rawSlug) : toSlug(title);
        if (!slug) return { ok: false, message: "Invalid slug." };

        const conflict = await prisma.page.findFirst({ where: { slug, NOT: { id } } });
        if (conflict) return { ok: false, message: "A page with this slug already exists." };

        const old = await prisma.page.findUnique({ where: { id }, select: { slug: true } });
        await prisma.page.update({ where: { id }, data: { slug, title, content, published } });
        await logAudit(sess.user.id, "UPDATE_PAGE", { targetType: "page", targetId: id, targetLabel: title });
        revalidatePath("/admin");
        if (old?.slug) revalidatePath(`/pages/${old.slug}`);
        revalidatePath(`/pages/${slug}`);
        return { ok: true, message: "Page updated." };
    } catch {
        return { ok: false, message: "Failed to update page." };
    }
}

export async function deletePage(fd: FormData) {
    const sess = await requireContentModerator();
    const id = fd.get("id") as string;
    const page = await prisma.page.findUnique({ where: { id }, select: { slug: true, title: true } });
    await prisma.page.delete({ where: { id } });
    await logAudit(sess.user.id, "DELETE_PAGE", { targetType: "page", targetId: id, targetLabel: page?.title || page?.slug });
    revalidatePath("/admin");
    if (page?.slug) revalidatePath(`/pages/${page.slug}`);
}

export async function togglePagePublished(fd: FormData) {
    const sess = await requireContentModerator();
    const id = fd.get("id") as string;
    const page = await prisma.page.findUnique({ where: { id } });
    if (!page) return;
    await prisma.page.update({ where: { id }, data: { published: !page.published } });
    await logAudit(sess.user.id, "TOGGLE_PAGE_PUBLISHED", {
        targetType: "page",
        targetId: id,
        targetLabel: page.title,
        metadata: { published: !page.published },
    });
    revalidatePath("/admin");
    revalidatePath(`/pages/${page.slug}`);
}

// ── Widget ────────────────────────────────────────────────────────────────────

export async function saveWidgetSettings(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const enabled = fd.has("widgetEnabled") ? "true" : "false";
        const title = ((fd.get("widgetTitle") as string) ?? "").trim().slice(0, 100) || "Chat with Us";
        const color = ((fd.get("widgetColor") as string) ?? "").trim() || "#3B82F6";
        const position = (fd.get("widgetPosition") as string) === "bottom-left" ? "bottom-left" : "bottom-right";
        const botName = ((fd.get("widgetBotName") as string) ?? "").trim().slice(0, 60) || "Assistant";
        const welcomeMessage = ((fd.get("widgetWelcomeMessage") as string) ?? "").trim().slice(0, 300);
        const systemPrompt = ((fd.get("widgetSystemPrompt") as string) ?? "").trim().slice(0, 2000);
        const rateLimitPerHour = Math.max(0, parseInt((fd.get("widgetRateLimitPerHour") as string) || "20") || 20);

        const pairs: [string, string][] = [
            ["widgetEnabled", enabled],
            ["widgetTitle", title],
            ["widgetColor", color],
            ["widgetPosition", position],
            ["widgetBotName", botName],
            ["widgetWelcomeMessage", welcomeMessage],
            ["widgetSystemPrompt", systemPrompt],
            ["widgetRateLimitPerHour", String(rateLimitPerHour)],
        ];

        for (const [key, value] of pairs) {
            await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
        }

        await logAudit(sess.user.id, "UPDATE_WIDGET", { metadata: { enabled } });
        revalidatePath("/admin");
        return { ok: true, message: enabled === "true" ? "Widget enabled and settings saved." : "Widget disabled." };
    } catch {
        return { ok: false, message: "Failed to save widget settings." };
    }
}

// ── Cohere Reranking ──────────────────────────────────────────────────────────

export async function saveCohereSettings(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const key = (fd.get("cohereApiKey") as string)?.trim() || "";
        const enabled = fd.has("cohereEnabled") ? "true" : "false";

        if (enabled === "true" && !key) {
            return { ok: false, message: "A Cohere API key is required to enable reranking." };
        }

        for (const [k, v] of [["cohereApiKey", key], ["cohereEnabled", enabled]] as const) {
            await prisma.setting.upsert({ where: { key: k }, update: { value: v }, create: { key: k, value: v } });
        }
        await logAudit(sess.user.id, "UPDATE_COHERE", { metadata: { enabled } });
        revalidatePath("/admin");
        return { ok: true, message: enabled === "true" ? "Cohere reranking enabled." : "Cohere reranking disabled." };
    } catch {
        return { ok: false, message: "Failed to save Cohere settings." };
    }
}

// ── Data Connectors (Google Drive) ────────────────────────────────────────────

export async function saveConnectorGoogle(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const clientId = (fd.get("connectorGoogleClientId") as string)?.trim() || "";
        const clientSecret = (fd.get("connectorGoogleClientSecret") as string)?.trim() || "";

        for (const [key, value] of [
            ["connectorGoogleClientId", clientId],
            ["connectorGoogleClientSecret", clientSecret],
        ] as const) {
            await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
        }
        await logAudit(sess.user.id, "UPDATE_CONNECTOR_GOOGLE", { metadata: { configured: Boolean(clientId && clientSecret) } });
        revalidatePath("/admin");
        return { ok: true, message: "Google Drive connector settings saved." };
    } catch {
        return { ok: false, message: "Failed to save connector settings." };
    }
}

// ── Agent Tools ───────────────────────────────────────────────────────────────

export async function saveToolSettings(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const enabled = fd.has("toolsEnabled") ? "true" : "false";
        const searchProvider = (fd.get("toolSearchProvider") as string) || "serper";
        const searchApiKey = ((fd.get("toolSearchApiKey") as string) ?? "").trim();
        const allowedTools = fd.getAll("toolAllowedList").join(",");

        const pairs: [string, string][] = [
            ["toolsEnabled", enabled],
            ["toolSearchProvider", searchProvider],
            ["toolSearchApiKey", searchApiKey],
            ["toolAllowedList", allowedTools],
        ];
        for (const [key, value] of pairs) {
            await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
        }
        await logAudit(sess.user.id, "UPDATE_TOOLS", { metadata: { enabled, searchProvider, allowedTools } });
        revalidatePath("/admin");
        return { ok: true, message: enabled === "true" ? "Agent tools enabled and saved." : "Agent tools disabled." };
    } catch {
        return { ok: false, message: "Failed to save tool settings." };
    }
}

// ── MCP Servers (Model Context Protocol) ──────────────────────────────────────

export interface McpServerItem {
    id: string;
    name: string;
    description: string;
    url: string;
    transport: "http" | "sse";
    headers: { key: string; value: string }[];
    enabled: boolean;
}

export async function saveMcpServers(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const raw = fd.get("mcpServers") as string;
        const parsed: McpServerItem[] = JSON.parse(raw);
        const servers = parsed
            .map((s) => ({
                id: String(s.id),
                name: String(s.name ?? "").trim().slice(0, 100),
                description: String(s.description ?? "").slice(0, 200),
                url: String(s.url ?? "").trim().slice(0, 500),
                transport: s.transport === "sse" ? "sse" : "http",
                headers: Array.isArray(s.headers)
                    ? s.headers
                          .filter((h) => h && typeof h.key === "string" && h.key.trim())
                          .map((h) => ({ key: String(h.key).trim().slice(0, 100), value: String(h.value ?? "").slice(0, 2000) }))
                    : [],
                enabled: Boolean(s.enabled),
            }))
            .filter((s) => s.name && s.url);

        await prisma.setting.upsert({
            where: { key: "mcpServers" },
            update: { value: JSON.stringify(servers) },
            create: { key: "mcpServers", value: JSON.stringify(servers) },
        });
        await logAudit(sess.user.id, "UPDATE_MCP_SERVERS", {
            metadata: { total: servers.length, enabled: servers.filter((s) => s.enabled).length },
        });
        revalidatePath("/admin");
        return { ok: true, message: `${servers.filter((s) => s.enabled).length} active MCP server(s) saved.` };
    } catch {
        return { ok: false, message: "Failed to save MCP servers." };
    }
}

// ── Maintenance Mode ──────────────────────────────────────────────────────────

export async function saveMaintenanceMode(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireAdmin();
    try {
        const enabled = fd.has("maintenanceModeEnabled") ? "true" : "false";
        await prisma.setting.upsert({
            where: { key: "maintenanceModeEnabled" },
            update: { value: enabled },
            create: { key: "maintenanceModeEnabled", value: enabled },
        });
        await logAudit(sess.user.id, "UPDATE_MAINTENANCE_MODE", { metadata: { enabled } });
        revalidatePath("/admin");
        return { ok: true, message: enabled === "true" ? "Maintenance mode enabled. Non-admin users will see the maintenance page." : "Maintenance mode disabled." };
    } catch {
        return { ok: false, message: "Failed to save maintenance mode settings." };
    }
}

// ── Admin Notifications ───────────────────────────────────────────────────────

export async function sendNotificationToUser(fd: FormData) {
    const sess = await requireUserManager();
    const userId = fd.get("userId") as string;
    const title = (fd.get("title") as string)?.trim().slice(0, 200);
    const body = (fd.get("body") as string)?.trim().slice(0, 500) || undefined;
    const link = (fd.get("link") as string)?.trim().slice(0, 500) || undefined;
    if (!userId || !title) return;
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    await prisma.notification.create({ data: { userId, type: "admin_announcement", title, body, link } });
    await logAudit(sess.user.id, "SEND_NOTIFICATION", {
        targetType: "user",
        targetId: userId,
        targetLabel: target?.email || userId,
        metadata: { title },
    });
}

export async function broadcastNotification(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireUserManager();
    const title = (fd.get("title") as string)?.trim().slice(0, 200);
    const body = (fd.get("body") as string)?.trim().slice(0, 500) || undefined;
    const link = (fd.get("link") as string)?.trim().slice(0, 500) || undefined;
    if (!title) return { ok: false, message: "Title is required." };
    try {
        const users = await prisma.user.findMany({ select: { id: true } });
        await prisma.notification.createMany({
            data: users.map((u) => ({ userId: u.id, type: "admin_announcement" as const, title, body, link })),
        });
        await logAudit(sess.user.id, "BROADCAST_NOTIFICATION", { metadata: { title, recipients: users.length } });
        revalidatePath("/admin");
        return { ok: true, message: `Notification sent to ${users.length} user(s).` };
    } catch {
        return { ok: false, message: "Failed to send broadcast notification." };
    }
}

// ── Provider API Keys (OpenRouter / OpenAI / Anthropic / DeepSeek / Qwen) ────

export async function saveProviderApiKeys(_: unknown, fd: FormData): Promise<ActionResult> {
    const sess = await requireBillingAdmin();
    try {
        const openrouter    = ((fd.get("openrouterApiKey") as string) ?? "").trim();
        const openai        = ((fd.get("openaiApiKey")     as string) ?? "").trim();
        const openaiBaseUrl = ((fd.get("openaiBaseUrl")    as string) ?? "").trim();
        const anthropic     = ((fd.get("anthropicApiKey")  as string) ?? "").trim();
        const deepseek      = ((fd.get("deepseekApiKey")   as string) ?? "").trim();
        const qwen          = ((fd.get("qwenApiKey")       as string) ?? "").trim();

        const value = JSON.stringify({ openrouter, openai, openaiBaseUrl, anthropic, deepseek, qwen });
        await prisma.setting.upsert({
            where: { key: "providerApiKeys" },
            update: { value },
            create: { key: "providerApiKeys", value },
        });
        // Mirror to the dedicated setting used by the model list fetcher
        if (openrouter) {
            await prisma.setting.upsert({
                where: { key: "openRouterApiKey" },
                update: { value: openrouter },
                create: { key: "openRouterApiKey", value: openrouter },
            });
        }
        await logAudit(sess.user.id, "UPDATE_PROVIDER_API_KEYS");
        revalidatePath("/admin");
        return { ok: true, message: "Provider API keys saved." };
    } catch {
        return { ok: false, message: "Failed to save provider API keys." };
    }
}

// Legacy single-key — bootstraps the array if empty
export async function saveApiKey(fd: FormData) {
    await requireBillingAdmin();
    const value = (fd.get("openRouterApiKey") as string)?.trim();
    if (!value) return;
    const keys = await readApiKeys();
    if (keys.length === 0) {
        keys.push({ id: crypto.randomUUID(), label: "Default", key: value, active: true });
    } else {
        const active = keys.find((k) => k.active);
        if (active) active.key = value;
    }
    await writeApiKeys(keys);
    revalidatePath("/admin");
}
