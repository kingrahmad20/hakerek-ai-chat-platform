import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGoogleClientCreds, buildAuthUrl, signState } from "@/lib/connectors/google-oauth";

export const dynamic = "force-dynamic";

// Kicks off the Google Drive OAuth consent flow for a specific knowledge base.
// Redirects the browser to Google; the callback finishes the handshake.
export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const url = new URL(req.url);
    const kbId = url.searchParams.get("knowledgeBaseId");
    if (!kbId) return new Response("knowledgeBaseId is required", { status: 400 });

    // Ownership: only the KB owner may attach a connector to it.
    const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } });
    if (!kb || kb.userId !== session.user.id) return new Response("Not found", { status: 404 });

    const creds = await getGoogleClientCreds();
    if (!creds) {
        return new Response("Google connector is not configured. Set the OAuth client in admin settings.", { status: 503 });
    }

    const state = signState(kbId, session.user.id);
    return Response.redirect(buildAuthUrl(creds, state), 302);
}
