import { createHmac, timingSafeEqual } from "crypto";
import type { KnowledgeConnector } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { logger } from "@/lib/logger";

// Google OAuth + token lifecycle for knowledge-base connectors. This is
// deliberately separate from the NextAuth Google *login* provider: connectors
// request offline access with broader scopes (Drive) and persist their own
// refresh tokens, independent of whether the user signed in with Google.

// drive.readonly lets us list/export/download files the user grants access to.
// openid + email identify which Google account is connected (shown in the UI).
export const GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "openid",
    "email",
].join(" ");

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

// Refresh a little before the real expiry to avoid races with in-flight calls.
const EXPIRY_SKEW_MS = 60_000;

export interface GoogleClientCreds {
    clientId: string;
    clientSecret: string;
}

export async function getGoogleClientCreds(): Promise<GoogleClientCreds | null> {
    const settings = await prisma.setting.findMany({
        where: { key: { in: ["connectorGoogleClientId", "connectorGoogleClientSecret"] } },
    });
    const get = (k: string) => settings.find((s) => s.key === k)?.value?.trim();
    const clientId = get("connectorGoogleClientId");
    const clientSecret = get("connectorGoogleClientSecret");
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
}

export function getRedirectUri(): string {
    const base = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
    return `${base}/api/connectors/google/callback`;
}

// ── Signed OAuth state ─────────────────────────────────────────────────────────
// State carries the target knowledge base + initiating user across the redirect.
// It is HMAC-signed with NEXTAUTH_SECRET so the callback can trust it without a
// server-side session store, and time-boxed to limit replay.

interface StatePayload {
    kbId: string;
    userId: string;
    nonce: string;
    ts: number;
}

const STATE_TTL_MS = 10 * 60 * 1000;

function stateKey(): string {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error("NEXTAUTH_SECRET is required for connector OAuth state");
    return secret;
}

export function signState(kbId: string, userId: string): string {
    const payload: StatePayload = { kbId, userId, nonce: Math.random().toString(36).slice(2), ts: Date.now() };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", stateKey()).update(body).digest("base64url");
    return `${body}.${sig}`;
}

export function verifyState(state: string): StatePayload | null {
    const dot = state.lastIndexOf(".");
    if (dot < 0) return null;
    const body = state.slice(0, dot);
    const sig = state.slice(dot + 1);
    const expected = createHmac("sha256", stateKey()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
        if (typeof payload.ts !== "number" || Date.now() - payload.ts > STATE_TTL_MS) return null;
        if (!payload.kbId || !payload.userId) return null;
        return payload;
    } catch {
        return null;
    }
}

// ── OAuth URL + token exchange ──────────────────────────────────────────────────

export function buildAuthUrl(creds: GoogleClientCreds, state: string): string {
    const params = new URLSearchParams({
        client_id: creds.clientId,
        redirect_uri: getRedirectUri(),
        response_type: "code",
        scope: GOOGLE_SCOPES,
        access_type: "offline", // ask for a refresh token
        prompt: "consent", // force a refresh token even on re-consent
        include_granted_scopes: "true",
        state,
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number; // seconds
    scope?: string;
    token_type?: string;
}

export async function exchangeCode(creds: GoogleClientCreds, code: string): Promise<TokenResponse> {
    const resp = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            redirect_uri: getRedirectUri(),
            grant_type: "authorization_code",
        }),
        signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) {
        throw new Error(`Google token exchange ${resp.status}: ${await resp.text().catch(() => "")}`);
    }
    return resp.json();
}

async function refreshAccessToken(creds: GoogleClientCreds, refreshToken: string): Promise<TokenResponse> {
    const resp = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
        signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) {
        throw new Error(`Google token refresh ${resp.status}: ${await resp.text().catch(() => "")}`);
    }
    return resp.json();
}

export async function fetchAccountEmail(accessToken: string): Promise<string | null> {
    try {
        const resp = await fetch(USERINFO_ENDPOINT, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(15_000),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        return typeof data.email === "string" ? data.email : null;
    } catch {
        return null;
    }
}

// Returns a usable access token for the connector, transparently refreshing and
// persisting a new one (re-encrypted) when the stored token is expired/expiring.
// Throws if the connector has no refresh token or refresh fails — callers should
// mark the connector as errored.
export async function getValidAccessToken(connector: KnowledgeConnector): Promise<string> {
    const notExpired =
        connector.accessToken &&
        connector.expiresAt &&
        connector.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
    if (notExpired && connector.accessToken) {
        return decryptSecret(connector.accessToken);
    }

    if (!connector.refreshToken) {
        throw new Error("Connector has no refresh token; reconnect required");
    }
    const creds = await getGoogleClientCreds();
    if (!creds) throw new Error("Google connector OAuth client is not configured");

    const refreshToken = decryptSecret(connector.refreshToken);
    const tokens = await refreshAccessToken(creds, refreshToken);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await prisma.knowledgeConnector.update({
        where: { id: connector.id },
        data: {
            accessToken: encryptSecret(tokens.access_token),
            expiresAt,
            // Google may issue a rotated refresh token; persist if present.
            ...(tokens.refresh_token ? { refreshToken: encryptSecret(tokens.refresh_token) } : {}),
        },
    });
    logger.info("connector_token_refreshed", { connectorId: connector.id });
    return tokens.access_token;
}
