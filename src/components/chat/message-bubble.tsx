/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useEffect } from "react";
import { User, Pencil, Check, X, Copy, Share2, RefreshCw, GitBranch, Download, MessageSquare, ThumbsUp, ThumbsDown, Smile, Pin, Volume2, VolumeX, Code2, Braces, FileCode2, FileText, Image as ImageIcon, ArrowUpRight } from "lucide-react";
import { useSession } from "next-auth/react";
import { parseAssistantSegments, type Artifact, type ArtifactKind } from "@/lib/artifacts";
import type { ChatMessage, MessageReaction } from "@/types";

const EMOJI_REACTIONS = ["❤️", "😂", "🎉", "🤔"];

interface Props {
    message: ChatMessage;
    onEdit?: (newText: string) => void;
    onRegenerate?: () => void;
    onFork?: () => void;
    onReply?: () => void;
    onReact?: (messageId: string, type: string) => void;
    onPin?: (messageId: string) => void;
    pinned?: boolean;
    replyCount?: number;
    onSpeak?: () => void;
    isSpeaking?: boolean;
    onOpenArtifact?: (artifact: Artifact, all: Artifact[]) => void;
    activeArtifactId?: string | null;
    /** In collaborative chats, attribute a user message sent by someone other than the viewer. */
    authorLabel?: string | null;
    authorImage?: string | null;
}

const ARTIFACT_KIND_LABEL: Record<ArtifactKind, string> = {
    html: "HTML",
    svg: "SVG",
    react: "React",
    markdown: "Markdown",
    code: "Code",
};

function artifactIcon(kind: ArtifactKind) {
    switch (kind) {
        case "html": return <FileCode2 size={15} />;
        case "svg": return <ImageIcon size={15} />;
        case "react": return <Braces size={15} />;
        case "markdown": return <FileText size={15} />;
        default: return <Code2 size={15} />;
    }
}

function ArtifactCard({ artifact, active, onOpen }: { artifact: Artifact; active: boolean; onOpen: () => void }) {
    const lineCount = artifact.code.split("\n").length;
    return (
        <button
            onClick={onOpen}
            className={`group/art flex items-center gap-3 w-full max-w-md my-2 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                active
                    ? "border-blue-500 bg-blue-950/40"
                    : "border-gray-600 bg-gray-900/60 hover:border-gray-500 hover:bg-gray-900"
            }`}
        >
            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-800 text-blue-300 shrink-0">
                {artifactIcon(artifact.kind)}
            </span>
            <span className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium text-gray-100 truncate">{artifact.title}</span>
                <span className="text-xs text-gray-500">
                    {ARTIFACT_KIND_LABEL[artifact.kind]} · {lineCount} line{lineCount !== 1 ? "s" : ""}
                </span>
            </span>
            <ArrowUpRight size={16} className="text-gray-500 group-hover/art:text-blue-300 shrink-0" />
        </button>
    );
}

function renderAssistantBody(
    message: ChatMessage,
    text: string,
    onOpenArtifact?: (artifact: Artifact, all: Artifact[]) => void,
    activeArtifactId?: string | null,
): React.ReactNode {
    if (!onOpenArtifact || !text.includes("```")) return renderAssistantText(text);

    const segments = parseAssistantSegments(message.id, text);
    const allArtifacts = segments.filter((s) => s.type === "artifact").map((s) => (s as { artifact: Artifact }).artifact);
    if (allArtifacts.length === 0) return renderAssistantText(text);

    return segments.map((seg, i) =>
        seg.type === "text"
            ? <span key={i}>{renderAssistantText(seg.text)}</span>
            : <ArtifactCard
                key={i}
                artifact={seg.artifact}
                active={activeArtifactId === seg.artifact.id}
                onOpen={() => onOpenArtifact(seg.artifact, allArtifacts)}
              />
    );
}

// Matches markdown images — including base64 data URLs — emitted inline by the
// generate_image agent tool (see src/app/api/chat/route.ts).
const INLINE_IMAGE_RE = /!\[([^\]]*)\]\((data:[^)\s]+|https?:\/\/[^)\s]+)\)/g;

/**
 * Render assistant text, turning inline `![alt](url)` markdown images into actual
 * <img> elements while leaving the surrounding text untouched.
 */
function renderAssistantText(text: string): React.ReactNode {
    if (!text || !text.includes("![")) return text;

    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    INLINE_IMAGE_RE.lastIndex = 0;
    while ((match = INLINE_IMAGE_RE.exec(text)) !== null) {
        if (match.index > lastIndex) {
            nodes.push(text.slice(lastIndex, match.index));
        }
        const alt = match[1];
        const url = match[2];
        nodes.push(
            <div key={`img-${key++}`} className="relative group/img my-2">
                <img
                    src={url}
                    alt={alt}
                    className="max-w-sm rounded-xl object-contain border border-gray-700"
                />
                <a
                    href={url}
                    download="generated-image.png"
                    title="Unduh gambar"
                    className="absolute top-2 right-2 opacity-0 group-hover/img:opacity-100 p-1.5 bg-black/60 hover:bg-black/80 rounded-lg transition-opacity"
                >
                    <Download size={14} className="text-white" />
                </a>
            </div>
        );
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex));
    }
    return nodes;
}

function parseMessageContent(message: ChatMessage): { text: string; imageUrls: string[]; isGeneratedImage: boolean } {
    const fileParts = (message.parts as any[])?.filter(
        (p: any) => p.type === "file" && typeof p.url === "string"
    ) ?? [];
    const imageUrls: string[] = fileParts.map((p: any) => p.url);

    const rawText = message.parts?.filter((p) => p.type === "text").map((p) => p.text).join("")
        || message.content || "";

    if (imageUrls.length === 0) {
        try {
            const parsed = JSON.parse(rawText);
            if (parsed && typeof parsed === "object" && "text" in parsed) {
                return {
                    text: parsed.text ?? "",
                    imageUrls: parsed.files ?? [],
                    isGeneratedImage: parsed.type === "generated_image",
                };
            }
        } catch { /* plain text */ }
    }

    return { text: rawText, imageUrls, isGeneratedImage: false };
}

function ReactionBar({ messageId: _messageId, reactions, onReact }: {
    messageId: string;
    reactions: MessageReaction[];
    onReact: (type: string) => void;
}) {
    const [showEmojis, setShowEmojis] = useState(false);
    const emojiRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showEmojis) return;
        const handler = (e: MouseEvent) => {
            if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
                setShowEmojis(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showEmojis]);

    const getReaction = (type: string) => reactions.find((r) => r.type === type);
    const thumbsUp = getReaction("thumbs_up");
    const thumbsDown = getReaction("thumbs_down");

    const emojiReactions = reactions.filter((r) => EMOJI_REACTIONS.includes(r.type));

    return (
        <div className="flex items-center gap-1 flex-wrap">
            {/* Thumbs up */}
            <button
                onClick={() => onReact("thumbs_up")}
                title="Helpful"
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                    thumbsUp?.userReacted
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : "text-gray-500 hover:text-green-400 hover:bg-gray-800"
                }`}
            >
                <ThumbsUp size={12} />
                {thumbsUp && thumbsUp.count > 0 && <span>{thumbsUp.count}</span>}
            </button>

            {/* Thumbs down */}
            <button
                onClick={() => onReact("thumbs_down")}
                title="Not helpful"
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                    thumbsDown?.userReacted
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "text-gray-500 hover:text-red-400 hover:bg-gray-800"
                }`}
            >
                <ThumbsDown size={12} />
                {thumbsDown && thumbsDown.count > 0 && <span>{thumbsDown.count}</span>}
            </button>

            {/* Existing emoji reactions */}
            {emojiReactions.map((r) => (
                <button
                    key={r.type}
                    onClick={() => onReact(r.type)}
                    title={r.type}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                        r.userReacted
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            : "text-gray-400 hover:bg-gray-800"
                    }`}
                >
                    <span>{r.type}</span>
                    {r.count > 1 && <span className="text-gray-400">{r.count}</span>}
                </button>
            ))}

            {/* Emoji picker toggle */}
            <div className="relative" ref={emojiRef}>
                <button
                    onClick={() => setShowEmojis((v) => !v)}
                    title="Add reaction"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors opacity-0 group-hover:opacity-100"
                >
                    <Smile size={12} />
                </button>
                {showEmojis && (
                    <div className="absolute bottom-full left-0 mb-1 flex gap-1 bg-gray-800 border border-gray-700 rounded-xl p-2 shadow-xl z-10">
                        {EMOJI_REACTIONS.map((emoji) => {
                            const existing = getReaction(emoji);
                            return (
                                <button
                                    key={emoji}
                                    onClick={() => { onReact(emoji); setShowEmojis(false); }}
                                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-base hover:bg-gray-700 transition-colors ${existing?.userReacted ? "bg-blue-500/20" : ""}`}
                                >
                                    {emoji}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export function MessageBubble({ message, onEdit, onRegenerate, onFork, onReply, onReact, onPin, pinned = false, replyCount = 0, onSpeak, isSpeaking = false, onOpenArtifact, activeArtifactId = null, authorLabel = null, authorImage = null }: Props) {
    const { text, imageUrls, isGeneratedImage } = parseMessageContent(message);
    const isUser = message.role === "user";
    const { data: session } = useSession();
    // In a collaborative chat, a message from another participant shows their name
    // and avatar; otherwise fall back to the current viewer's own avatar.
    const userImage = authorImage ?? session?.user?.image;
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(text || "");
    const [copied, setCopied] = useState(false);
    const [shared, setShared] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const reactions = message.reactions ?? [];

    // Strip inline image markdown (which may contain multi-megabyte data URLs) so
    // copy/share produces readable text rather than a wall of base64.
    const plainText = text.replace(INLINE_IMAGE_RE, (_m, alt) => alt || "[image]");

    const handleCopy = async () => {
        await navigator.clipboard.writeText(plainText).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleShare = async () => {
        if (navigator.share) {
            try { await navigator.share({ text: plainText }); } catch { /* user cancelled */ }
        } else {
            await navigator.clipboard.writeText(plainText).catch(() => {});
            setShared(true);
            setTimeout(() => setShared(false), 2000);
        }
    };

    useEffect(() => {
        if (editing && textareaRef.current) {
            textareaRef.current.focus();
            const len = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(len, len);
        }
    }, [editing]);

    const startEdit = () => {
        setDraft(text);
        setEditing(true);
    };

    const cancel = () => setEditing(false);

    const save = () => {
        const trimmed = draft.trim();
        if (!trimmed || trimmed === text) { cancel(); return; }
        setEditing(false);
        onEdit?.(trimmed);
    };

    if (!isUser) {
        return (
            <div className="group flex flex-col gap-0.5 max-w-3xl mx-auto w-full">
                {pinned && (
                    <div className="flex items-center gap-1 text-[10px] text-amber-400 px-0.5 mb-0.5">
                        <Pin size={10} className="fill-amber-400" /> Pinned
                    </div>
                )}
                <div className="flex gap-3">
                    {isGeneratedImage && imageUrls.length > 0 ? (
                        <div className="max-w-[90%] sm:max-w-[80%] space-y-2">
                            <div className="flex flex-wrap gap-2">
                                {imageUrls.map((url, i) => (
                                    <div key={i} className="relative group/img">
                                        <img
                                            src={url}
                                            alt={text}
                                            className="max-w-sm rounded-xl object-contain border border-gray-700"
                                        />
                                        <a
                                            href={url}
                                            download="generated-image.png"
                                            title="Unduh gambar"
                                            className="absolute top-2 right-2 opacity-0 group-hover/img:opacity-100 p-1.5 bg-black/60 hover:bg-black/80 rounded-lg transition-opacity"
                                        >
                                            <Download size={14} className="text-white" />
                                        </a>
                                    </div>
                                ))}
                            </div>
                            {text && (
                                <p className="text-xs text-gray-500 italic px-1">{text}</p>
                            )}
                        </div>
                    ) : (
                        <div className="px-4 py-3 rounded-2xl max-w-[90%] sm:max-w-[80%] leading-relaxed whitespace-pre-wrap text-sm bg-gray-800 text-gray-100 rounded-bl-sm">
                            {imageUrls.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {imageUrls.map((url, i) => (
                                        <img key={i} src={url} alt="" className="max-w-xs max-h-48 rounded-lg object-contain" />
                                    ))}
                                </div>
                            )}
                            {renderAssistantBody(message, text, onOpenArtifact, activeArtifactId)}
                        </div>
                    )}
                </div>

                {/* Action bar — visible on hover */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button
                        onClick={handleCopy}
                        title={copied ? "Tersalin!" : "Salin respons"}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors"
                    >
                        {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                        <span className={copied ? "text-green-400" : ""}>{copied ? "Tersalin" : "Salin"}</span>
                    </button>
                    <button
                        onClick={handleShare}
                        title="Bagikan respons"
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors"
                    >
                        {shared ? <Check size={12} className="text-green-400" /> : <Share2 size={12} />}
                        <span className={shared ? "text-green-400" : ""}>{shared ? "Disalin!" : "Bagikan"}</span>
                    </button>
                    {onRegenerate && (
                        <button
                            onClick={onRegenerate}
                            title="Buat ulang respons"
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors"
                        >
                            <RefreshCw size={12} /> Buat Ulang
                        </button>
                    )}
                    {onFork && (
                        <button
                            onClick={onFork}
                            title="Fork percakapan dari sini"
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors"
                        >
                            <GitBranch size={12} /> Fork
                        </button>
                    )}
                    {onReply && (
                        <button
                            onClick={onReply}
                            title="Reply in thread"
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors"
                        >
                            <MessageSquare size={12} /> Reply
                        </button>
                    )}
                    {onPin && (
                        <button
                            onClick={() => onPin(message.id)}
                            title={pinned ? "Unpin message" : "Pin message"}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                                pinned
                                    ? "text-amber-400 hover:text-amber-300 hover:bg-gray-800"
                                    : "text-gray-500 hover:text-amber-400 hover:bg-gray-800"
                            }`}
                        >
                            <Pin size={12} className={pinned ? "fill-amber-400" : ""} />
                            {pinned ? "Unpin" : "Pin"}
                        </button>
                    )}
                    {onSpeak && (
                        <button
                            onClick={onSpeak}
                            title={isSpeaking ? "Stop reading" : "Read aloud"}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                                isSpeaking
                                    ? "text-blue-400 hover:text-blue-300 hover:bg-gray-800 animate-pulse"
                                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                            }`}
                        >
                            {isSpeaking ? <VolumeX size={12} /> : <Volume2 size={12} />}
                            {isSpeaking ? "Stop" : "Read"}
                        </button>
                    )}
                </div>

                {/* Reaction bar */}
                {onReact && (
                    <div className="pl-0.5">
                        <ReactionBar
                            messageId={message.id}
                            reactions={reactions}
                            onReact={(type) => onReact(message.id, type)}
                        />
                    </div>
                )}

                {/* Thread reply count badge */}
                {replyCount > 0 && (
                    <button
                        onClick={onReply}
                        className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors w-fit"
                    >
                        <MessageSquare size={12} />
                        {replyCount} {replyCount === 1 ? "reply" : "replies"}
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className={`flex gap-3 max-w-3xl mx-auto w-full justify-end ${editing ? "" : "group"}`}>
            {editing ? (
                <div className="flex-1 max-w-[90%] sm:max-w-[80%] space-y-2">
                    <textarea
                        ref={textareaRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
                            if (e.key === "Escape") cancel();
                        }}
                        rows={Math.min(10, Math.max(2, draft.split("\n").length))}
                        className="w-full px-4 py-3 bg-gray-700 border border-blue-500 rounded-2xl text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={cancel}
                            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            <X size={12} /> Cancel
                        </button>
                        <button
                            onClick={save}
                            className="flex items-center gap-1 text-xs text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
                        >
                            <Check size={12} /> Send
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex items-start gap-2">
                    <div className="flex flex-col gap-0.5 self-center">
                    {onFork && (
                        <button
                            onClick={onFork}
                            title="Fork percakapan dari sini"
                            className="opacity-0 group-hover:opacity-100 shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-all duration-150"
                        >
                            <GitBranch size={13} />
                        </button>
                    )}
                    {onReply && (
                        <button
                            onClick={onReply}
                            title="Reply in thread"
                            className="opacity-0 group-hover:opacity-100 shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-gray-700 transition-all duration-150"
                        >
                            <MessageSquare size={13} />
                        </button>
                    )}
                    {onEdit && (
                        <button
                            onClick={startEdit}
                            title="Edit message"
                            className="opacity-0 group-hover:opacity-100 shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-all duration-150"
                        >
                            <Pencil size={13} />
                        </button>
                    )}
                    {onPin && (
                        <button
                            onClick={() => onPin(message.id)}
                            title={pinned ? "Unpin message" : "Pin message"}
                            className={`opacity-0 group-hover:opacity-100 shrink-0 p-1.5 rounded-lg transition-all duration-150 ${
                                pinned
                                    ? "text-amber-400 hover:bg-gray-700"
                                    : "text-gray-500 hover:text-amber-400 hover:bg-gray-700"
                            }`}
                        >
                            <Pin size={13} className={pinned ? "fill-amber-400" : ""} />
                        </button>
                    )}
                    </div>
                    <div className="max-w-[90%] sm:max-w-[80%] space-y-1.5">
                        {authorLabel && (
                            <div className="text-[11px] text-gray-400 text-right px-0.5 font-medium">
                                {authorLabel}
                            </div>
                        )}
                        {pinned && (
                            <div className="flex items-center justify-end gap-1 text-[10px] text-amber-400 px-0.5">
                                <Pin size={10} className="fill-amber-400" /> Pinned
                            </div>
                        )}
                        {imageUrls.length > 0 && (
                            <div className="flex flex-wrap gap-2 justify-end">
                                {imageUrls.map((url, i) => (
                                    <img key={i} src={url} alt="" className="max-w-xs max-h-48 rounded-xl object-contain" />
                                ))}
                            </div>
                        )}
                        {text.trim() && (
                            <div className="px-4 py-3 rounded-2xl leading-relaxed whitespace-pre-wrap text-sm bg-blue-600 text-white rounded-br-sm">
                                {text}
                            </div>
                        )}
                        {replyCount > 0 && (
                            <div className="flex justify-end">
                                <button
                                    onClick={onReply}
                                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors"
                                >
                                    <MessageSquare size={12} />
                                    {replyCount} {replyCount === 1 ? "reply" : "replies"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            <div className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-700 shrink-0 mt-1 overflow-hidden">
                {userImage
                    ? <img src={userImage} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    : <User size={18} className="text-gray-200" />
                }
            </div>
        </div>
    );
}
