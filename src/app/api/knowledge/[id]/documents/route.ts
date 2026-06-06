import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDocument, indexDocument } from "@/lib/rag";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_TYPES = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/rtf",
    "text/rtf",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { id } = await params;
    const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
    if (!kb || kb.userId !== session.user.id) return new Response("Not found", { status: 404 });

    const docs = await prisma.knowledgeDocument.findMany({
        where: { knowledgeBaseId: id },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { chunks: true } } },
    });

    return Response.json(docs);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response("Unauthorized", { status: 401 });

    const { id } = await params;
    const kb = await prisma.knowledgeBase.findUnique({ where: { id } });
    if (!kb || kb.userId !== session.user.id) return new Response("Not found", { status: 404 });

    let formData: FormData;
    try { formData = await req.formData(); } catch { return new Response("Invalid form data", { status: 400 }); }

    const file = formData.get("file") as File | null;
    if (!file) return new Response("file field required", { status: 400 });

    const fileType = file.type || "text/plain";
    if (!ALLOWED_TYPES.has(fileType)) {
        return new Response(`Unsupported file type: ${fileType}`, { status: 415 });
    }
    if (file.size > MAX_FILE_SIZE) {
        return new Response("File too large (max 20 MB)", { status: 413 });
    }

    // Get API key from settings
    const settings = await prisma.setting.findMany({ where: { key: { in: ["apiKeys", "openRouterApiKey"] } } });
    const getSetting = (key: string) => settings.find((s) => s.key === key)?.value;
    let apiKey: string | undefined;
    const apiKeysRaw = getSetting("apiKeys");
    if (apiKeysRaw) {
        try {
            const keys: { key: string; active: boolean }[] = JSON.parse(apiKeysRaw);
            apiKey = keys.find((k) => k.active)?.key;
        } catch { /* ignore */ }
    }
    if (!apiKey) apiKey = getSetting("openRouterApiKey");
    if (!apiKey) return new Response("API key not configured", { status: 500 });

    // Create document record immediately so the UI can show processing status
    const doc = await prisma.knowledgeDocument.create({
        data: {
            knowledgeBaseId: id,
            fileName: file.name,
            fileType,
            fileSize: file.size,
            status: "processing",
        },
    });

    // Process asynchronously so we can return 202 immediately
    const buffer = Buffer.from(await file.arrayBuffer());
    const capturedApiKey = apiKey;
    const ownerId = session.user.id;
    setImmediate(async () => {
        try {
            const text = await parseDocument(buffer, fileType);
            await indexDocument(doc.id, text, capturedApiKey);
            await prisma.knowledgeDocument.update({
                where: { id: doc.id },
                data: { status: "ready" },
            });
            logger.info("rag_document_indexed", { documentId: doc.id, fileName: file.name });
            createNotification({
                userId: ownerId,
                type: "document_ready",
                title: `Document ready: ${file.name}`,
                body: "Your document has been processed and is ready to use in chats.",
                link: "/",
                refId: doc.id,
            }).catch(() => {});
        } catch (err) {
            const msg = String(err).slice(0, 500);
            logger.error("rag_document_failed", { documentId: doc.id, error: msg });
            await prisma.knowledgeDocument.update({
                where: { id: doc.id },
                data: { status: "error", errorMessage: msg },
            }).catch(() => {});
            createNotification({
                userId: ownerId,
                type: "document_ready",
                title: `Document failed: ${file.name}`,
                body: "There was an error processing your document.",
                link: "/",
                refId: doc.id,
            }).catch(() => {});
        }
    });

    return Response.json(doc, { status: 202 });
}
