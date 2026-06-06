import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generatePdf, type PdfBlock } from "@/lib/pdf";

export const dynamic = "force-dynamic";

type Format = "md" | "json" | "txt" | "pdf";
const FORMATS: Format[] = ["md", "json", "txt", "pdf"];

interface ExportMessage {
    id: string;
    role: string;
    content: string;
    model: string | null;
    createdAt: Date;
}

/** Stored message content is a plain string that may wrap a JSON `{ text, ... }` payload. */
function extractText(content: string): string {
    if (typeof content !== "string") return "";
    try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object" && "text" in parsed) return parsed.text ?? "";
    } catch {
        /* plain text */
    }
    return content;
}

function roleLabel(role: string): string {
    if (role === "user") return "User";
    if (role === "assistant") return "Assistant";
    return role.charAt(0).toUpperCase() + role.slice(1);
}

function safeFilename(title: string): string {
    const base = title.replace(/[^a-z0-9\-_\s]/gi, "").trim().replace(/\s+/g, "-").slice(0, 60);
    return base || "chat";
}

export async function GET(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chatId } = await params;
    const userId = session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    const formatParam = new URL(req.url).searchParams.get("format") ?? "md";
    const format = (FORMATS as string[]).includes(formatParam) ? (formatParam as Format) : "md";

    const chat = await prisma.chat.findFirst({
        where: { id: chatId, deletedAt: null },
        include: {
            messages: {
                where: { parentMessageId: null },
                orderBy: { createdAt: "asc" },
                select: { id: true, role: true, content: true, model: true, createdAt: true },
            },
        },
    });
    if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Access: owner, global admin, or a member of the chat's workspace.
    const allowed = chat.userId === userId || isAdmin || (chat.workspaceFolderId
        ? await (async () => {
            const folder = await prisma.workspaceFolder.findUnique({
                where: { id: chat.workspaceFolderId! },
                select: { workspaceId: true },
            });
            if (!folder) return false;
            const member = await prisma.workspaceMember.findUnique({
                where: { workspaceId_userId: { workspaceId: folder.workspaceId, userId } },
            });
            return !!member;
        })()
        : false);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const messages: ExportMessage[] = chat.messages.filter((m) => m.role !== "system");
    const filename = safeFilename(chat.title);
    const exportedAt = new Date();

    if (format === "json") {
        const body = {
            id: chat.id,
            title: chat.title,
            createdAt: chat.createdAt.toISOString(),
            exportedAt: exportedAt.toISOString(),
            messageCount: messages.length,
            messages: messages.map((m) => ({
                id: m.id,
                role: m.role,
                model: m.model,
                content: extractText(m.content),
                createdAt: m.createdAt.toISOString(),
            })),
        };
        return new NextResponse(JSON.stringify(body, null, 2), {
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Disposition": `attachment; filename="${filename}.json"`,
            },
        });
    }

    if (format === "txt") {
        const lines = [chat.title, `Exported ${exportedAt.toISOString()} - ${messages.length} messages`, ""];
        for (const m of messages) {
            const meta = m.model ? ` (${m.model})` : "";
            lines.push(`${roleLabel(m.role)}${meta}:`);
            lines.push(extractText(m.content) || "");
            lines.push("");
        }
        return new NextResponse(lines.join("\n"), {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Content-Disposition": `attachment; filename="${filename}.txt"`,
            },
        });
    }

    if (format === "pdf") {
        const blocks: PdfBlock[] = [
            { text: chat.title, bold: true, size: 18 },
            { text: `Exported ${exportedAt.toLocaleString()} · ${messages.length} message${messages.length !== 1 ? "s" : ""}`, size: 9, spaceBefore: 6 },
        ];
        for (const m of messages) {
            const meta = m.model ? `  (${m.model})` : "";
            blocks.push({ text: `${roleLabel(m.role)}${meta}`, bold: true, size: 11, spaceBefore: 16 });
            blocks.push({ text: extractText(m.content) || "(empty)", size: 10.5, spaceBefore: 2 });
        }
        const pdf = generatePdf(blocks, chat.title);
        return new NextResponse(new Uint8Array(pdf), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename}.pdf"`,
            },
        });
    }

    // Markdown (default)
    const md: string[] = [`# ${chat.title}`, "", `> Exported ${exportedAt.toISOString()} · ${messages.length} message${messages.length !== 1 ? "s" : ""}`, ""];
    for (const m of messages) {
        const meta = m.model ? ` _(${m.model})_` : "";
        md.push(`## ${roleLabel(m.role)}${meta}`);
        md.push(`*${m.createdAt.toISOString()}*`);
        md.push("");
        md.push(extractText(m.content) || "");
        md.push("");
        md.push("---");
        md.push("");
    }
    return new NextResponse(md.join("\n"), {
        headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}.md"`,
        },
    });
}
