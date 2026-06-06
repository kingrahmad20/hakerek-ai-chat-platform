// Artifact / code-canvas detection.
//
// Parses assistant message text into ordered segments so the chat can render
// substantial code blocks as clickable "artifact" cards that open in the side
// canvas (HTML/SVG/React live preview, rendered markdown, or a code view),
// while leaving prose and small inline snippets inline.

export type ArtifactKind = "html" | "svg" | "react" | "markdown" | "code";

export interface Artifact {
    id: string;          // stable: `${messageId}:${blockIndex}`
    title: string;
    kind: ArtifactKind;
    language: string;    // raw fence language token (lowercased), e.g. "tsx"
    code: string;
}

export type AssistantSegment =
    | { type: "text"; text: string }
    | { type: "artifact"; artifact: Artifact };

// Fenced code block: ```<info>\n<code>``` — info string captured separately.
const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

const LANGUAGE_KIND: Record<string, ArtifactKind> = {
    html: "html",
    htm: "html",
    svg: "svg",
    jsx: "react",
    tsx: "react",
    react: "react",
    markdown: "markdown",
    md: "markdown",
};

function kindForLanguage(lang: string): ArtifactKind {
    return LANGUAGE_KIND[lang] ?? "code";
}

// A fence is worth promoting to an artifact when it is a previewable kind, or
// when it is a substantial code block (so trivial snippets like `npm install`
// stay inline).
function qualifies(kind: ArtifactKind, code: string): boolean {
    if (!code.trim()) return false;
    if (kind !== "code") return true;
    return code.split("\n").length >= 5 || code.length >= 200;
}

const KIND_LABEL: Record<ArtifactKind, string> = {
    html: "HTML Preview",
    svg: "SVG Image",
    react: "React Component",
    markdown: "Markdown",
    code: "Code",
};

function deriveTitle(info: string, kind: ArtifactKind, language: string): string {
    // A filename token in the info string (e.g. ```tsx Button.tsx) wins.
    const fileToken = info.split(/\s+/).slice(1).find((t) => /\.[a-z0-9]+$/i.test(t));
    if (fileToken) return fileToken;
    if (kind === "code") return language ? `${language} snippet` : "Code";
    return KIND_LABEL[kind];
}

/**
 * Split assistant text into ordered text / artifact segments. Non-qualifying
 * fences are left as plain text so they render inline as before.
 */
export function parseAssistantSegments(messageId: string, text: string): AssistantSegment[] {
    if (!text || !text.includes("```")) return [{ type: "text", text }];

    const segments: AssistantSegment[] = [];
    let buffer = "";
    let lastIndex = 0;
    let blockIndex = 0;
    let match: RegExpExecArray | null;
    FENCE_RE.lastIndex = 0;

    const flush = () => {
        if (buffer) {
            segments.push({ type: "text", text: buffer });
            buffer = "";
        }
    };

    while ((match = FENCE_RE.exec(text)) !== null) {
        const info = match[1].trim();
        const language = info.split(/\s+/)[0]?.toLowerCase() ?? "";
        const code = match[2].replace(/\n$/, "");
        const kind = kindForLanguage(language);

        buffer += text.slice(lastIndex, match.index);
        lastIndex = match.index + match[0].length;

        if (qualifies(kind, code)) {
            flush();
            segments.push({
                type: "artifact",
                artifact: {
                    id: `${messageId}:${blockIndex}`,
                    title: deriveTitle(info, kind, language),
                    kind,
                    language,
                    code,
                },
            });
        } else {
            // Keep the whole fence inline as text.
            buffer += match[0];
        }
        blockIndex++;
    }

    buffer += text.slice(lastIndex);
    flush();
    return segments;
}

/** All artifacts in a message, in document order. */
export function extractArtifacts(messageId: string, text: string): Artifact[] {
    return parseAssistantSegments(messageId, text)
        .filter((s): s is Extract<AssistantSegment, { type: "artifact" }> => s.type === "artifact")
        .map((s) => s.artifact);
}
