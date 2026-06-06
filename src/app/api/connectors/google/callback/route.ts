import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import {
    getGoogleClientCreds,
    exchangeCode,
    fetchAccountEmail,
    verifyState,
} from "@/lib/connectors/google-oauth";
import { syncConnector } from "@/lib/connectors/sync";

export const dynamic = "force-dynamic";

function appRedirect(path: string): Response {
    const base = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
    return Response.redirect(`${base}${path}`, 302);
}

// Completes the Google OAuth handshake: validates signed state, exchanges the
// auth code for tokens, persists an encrypted connector, and triggers an initial
// sync. Errors redirect back to the app with a flag the UI can surface.
export async function GET(req: Request) {
    const url = new URL(req.url);
    const error = url.searchParams.get("error");
    if (error) return appRedirect(`/?connector_error=${encodeURIComponent(error)}`);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return appRedirect("/?connector_error=missing_params");

    const payload = verifyState(state);
    if (!payload) return appRedirect("/?connector_error=invalid_state");

    // Defense in depth: the signed state must match the current session user.
    const session = await getServerSession(authOptions);
    if (!session || session.user.id !== payload.userId) {
        return appRedirect("/?connector_error=session_mismatch");
    }

    // The KB must still exist and belong to this user.
    const kb = await prisma.knowledgeBase.findUnique({ where: { id: payload.kbId } });
    if (!kb || kb.userId !== payload.userId) return appRedirect("/?connector_error=not_found");

    const creds = await getGoogleClientCreds();
    if (!creds) return appRedirect("/?connector_error=not_configured");

    let connectorId: string;
    try {
        const tokens = await exchangeCode(creds, code);
        if (!tokens.refresh_token) {
            // Without offline access we can't keep syncing. This happens when the
            // user previously consented and Google withholds a new refresh token.
            logger.warn("connector_no_refresh_token", { kbId: payload.kbId });
            return appRedirect("/?connector_error=no_refresh_token");
        }
        const email = await fetchAccountEmail(tokens.access_token);
        const connector = await prisma.knowledgeConnector.create({
            data: {
                knowledgeBaseId: payload.kbId,
                userId: payload.userId,
                provider: "gdrive",
                status: "active",
                accountEmail: email,
                accessToken: encryptSecret(tokens.access_token),
                refreshToken: encryptSecret(tokens.refresh_token),
                expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
                scope: tokens.scope ?? null,
                // Default: sync the user's whole Drive. They can narrow to a
                // folder afterwards from the knowledge panel.
                config: { folderId: null, folderName: "My Drive" },
            },
        });
        connectorId = connector.id;
    } catch (err) {
        logger.error("connector_oauth_callback_failed", { kbId: payload.kbId, error: String(err).slice(0, 300) });
        return appRedirect("/?connector_error=oauth_failed");
    }

    // Fire-and-forget the first sync so the redirect returns immediately.
    setImmediate(() => {
        syncConnector(connectorId).catch((err) => {
            logger.error("connector_initial_sync_failed", { connectorId, error: String(err).slice(0, 300) });
        });
    });

    return appRedirect(`/?connected=gdrive&kb=${payload.kbId}`);
}
