/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import { Send, AlertCircle, RefreshCw, Download, Share2, Paperclip, X, Square, FileText, Bot, ChevronDown, Sparkles, Mic, MicOff, BookOpen, Check, Wrench, BookMarked, ChevronUp, RotateCcw, GitFork, Volume2, VolumeX, ListTodo, Theater, Loader2, Ghost, GitCompare, AudioLines } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { CompareView } from "./compare-view";
import { BranchSwitcher, type BranchEntry } from "./branch-switcher";
import { ThreadPanel } from "./thread-panel";
import { ActionItemsPanel } from "./action-items-panel";
import { ArtifactCanvas } from "./artifact-canvas";
import { useChatRealtime } from "./use-chat-realtime";
import { VoiceModeOverlay } from "./voice-mode-overlay";
import type { Artifact } from "@/lib/artifacts";
import type { ChatMessage, ChatParticipant, KnowledgeBaseSummary, MessageReaction } from "@/types";

const TYPING_WORDS = ["thinking", "hacking", "baking", "writing", "creating"];

type PendingFileKind = "image" | "pdf" | "text";

interface PendingFile {
    dataUrl: string;   // base64 data URL for image/pdf; raw text content for "text" kind
    name: string;
    kind: PendingFileKind;
}

interface AllowedModel {
    id: string;
    name: string;
}

interface AvailableTool {
    id: string;
    name: string;
    description: string;
}

interface ChatWindowProps {
    initialChatId: string | null;
    initialMessages: ChatMessage[];
    onChatCreated: (id: string) => void;
    onMessageSent: () => void;
    onStreamingChange?: (isStreaming: boolean) => void;
    isGuest: boolean;
    chatTitle?: string;
    sidebarOpen?: boolean;
    shareToken?: string | null;
    shareExpiresAt?: string | null;
    shareViewCount?: number;
    onShareToggle?: (expiresAt?: string | null) => Promise<void>;
    onRevokeAllShares?: () => Promise<void>;
    allowFileUpload?: boolean;
    onForkChat?: (newChatId: string) => void;
    allowedModels?: AllowedModel[];
    multiModelEnabled?: boolean;
    knowledgeBases?: KnowledgeBaseSummary[];
    availableTools?: AvailableTool[];
    toolsEnabled?: boolean;
    serverSttEnabled?: boolean;
    serverTtsEnabled?: boolean;
    parentChat?: BranchEntry | null;
    childBranches?: BranchEntry[];
    siblingBranches?: BranchEntry[];
    onNavigateBranch?: (chatId: string) => void;
    initialSummary?: string | null;
    conversationTemplates?: { id: string; name: string; prompt: string }[];
    slashCommands?: { id: string; command: string; description: string; prompt: string }[];
    personas?: { id: string; name: string; description: string; systemPrompt: string }[];
    initialPersonaId?: string | null;
    isCollaborative?: boolean;
    currentUserId?: string | null;
    participants?: ChatParticipant[];
    onTitleChange?: (chatId: string, title: string) => void;
    incognito?: boolean;
}

function compressImage(file: File, maxPx = 1024, quality = 0.82): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * ratio);
                canvas.height = Math.round(img.height * ratio);
                canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", quality));
            };
            img.onerror = reject;
            img.src = ev.target!.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

const IMAGE_PROMPT_PATTERNS = [
    /^(?:tolong\s+)?(?:buatkan?|bikin)\s+(?:(?:sebuah|satu)\s+)?(?:gambar|foto|ilustrasi)\b/i,
    /^(?:generate|create|make)\s+(?:an?\s+)?(?:image|picture|photo|illustration)\b/i,
    /^gambarkan\s+\S/i,
    /^draw\s+(?:me\s+)?(?:an?\s+)?\S/i,
];

function isImageGenerationPrompt(text: string): boolean {
    const t = text.trim();
    return IMAGE_PROMPT_PATTERNS.some((re) => re.test(t));
}

export function ChatWindow({ initialChatId, initialMessages, onChatCreated, onMessageSent, onStreamingChange, isGuest, chatTitle, sidebarOpen = true, shareToken, shareExpiresAt, shareViewCount, onShareToggle, onRevokeAllShares, allowFileUpload = false, onForkChat, allowedModels = [], multiModelEnabled = false, knowledgeBases = [], availableTools = [], toolsEnabled = false, serverSttEnabled = false, serverTtsEnabled = false, parentChat = null, childBranches = [], siblingBranches = [], onNavigateBranch, initialSummary = null, conversationTemplates = [], slashCommands = [], personas = [], initialPersonaId = null, isCollaborative = false, currentUserId = null, participants = [], onTitleChange, incognito = false }: ChatWindowProps) {
    const chatIdRef = useRef<string | null>(initialChatId);
    const pendingFilesRef = useRef<string[]>([]);
    const selectedModelRef = useRef<string>("");
    const activeKbIdsRef = useRef<string[]>([]);
    const activeToolIdsRef = useRef<string[]>([]);
    const personaIdRef = useRef<string>(initialPersonaId ?? "");
    const transport = useRef(
        new TextStreamChatTransport({
            api: "/api/chat",
            body: () => ({ chatId: chatIdRef.current, files: pendingFilesRef.current, selectedModel: selectedModelRef.current, knowledgeBaseIds: activeKbIdsRef.current, enabledTools: activeToolIdsRef.current, personaId: personaIdRef.current || undefined, incognito }),
        })
    );

    const { messages, sendMessage, setMessages, status, error, clearError, regenerate, stop } = useChat({
        transport: transport.current,
        messages: initialMessages as any,
    } as any);

    // ── Real-time collaboration ──────────────────────────────────────────────
    // For workspace chats, subscribe to the shared SSE stream: live messages from
    // other members, presence, typing, and "AI is responding" indicators.
    const collabEnabled = isCollaborative && !!initialChatId && !isGuest;
    const { viewers, typingUsers, respondingName } = useChatRealtime({
        chatId: initialChatId,
        enabled: collabEnabled,
        currentUserId,
        participants,
        setMessages: setMessages as any,
        onTitle: (title) => { if (initialChatId) onTitleChange?.(initialChatId, title); },
    });

    // Debounced typing broadcast for collaborative chats.
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isTypingRef = useRef(false);
    const sendTyping = (typing: boolean) => {
        if (!collabEnabled || !initialChatId) return;
        fetch(`/api/chats/${initialChatId}/typing`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ typing }),
        }).catch(() => {});
    };
    const notifyTyping = () => {
        if (!collabEnabled) return;
        if (!isTypingRef.current) {
            isTypingRef.current = true;
            sendTyping(true);
        }
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
            isTypingRef.current = false;
            sendTyping(false);
        }, 3000);
    };
    const stopTyping = () => {
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        if (isTypingRef.current) {
            isTypingRef.current = false;
            sendTyping(false);
        }
    };

    // Notify parent when streaming starts/stops
    const onStreamingChangeRef = useRef(onStreamingChange);
    onStreamingChangeRef.current = onStreamingChange;
    useEffect(() => {
        const isStreaming = status === "streaming" || status === "submitted";
        onStreamingChangeRef.current?.(isStreaming);
    }, [status]);

    const [input, setInput] = useState("");
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [imageGenError, setImageGenError] = useState<string | null>(null);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showSharePanel, setShowSharePanel] = useState(false);
    const [shareExpiry, setShareExpiry] = useState<string>("");
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [showCompare, setShowCompare] = useState(false);
    const [showKbDropdown, setShowKbDropdown] = useState(false);
    const [selectedModel, setSelectedModel] = useState<string>(() => allowedModels[0]?.id ?? "");
    const [activeKbIds, setActiveKbIds] = useState<string[]>([]);
    const [copied, setCopied] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
    const [activeToolIds, setActiveToolIds] = useState<string[]>([]);
    const [showToolsDropdown, setShowToolsDropdown] = useState(false);
    const [activePersonaId, setActivePersonaId] = useState<string | null>(initialPersonaId ?? null);
    const [showPersonaDropdown, setShowPersonaDropdown] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(false);
    const [ttsSupported, setTtsSupported] = useState(false);
    const [isTTSEnabled, setIsTTSEnabled] = useState(false);
    const [voiceModeOpen, setVoiceModeOpen] = useState(false);
    const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
    const [threadMessage, setThreadMessage] = useState<ChatMessage | null>(null);
    const [showActionItems, setShowActionItems] = useState(false);
    const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
    const [artifactList, setArtifactList] = useState<Artifact[]>([]);
    const [replyCounts, setReplyCounts] = useState<Record<string, number>>({});
    const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>(() => {
        const map: Record<string, MessageReaction[]> = {};
        for (const m of initialMessages) {
            if (m.reactions?.length) map[m.id] = m.reactions;
        }
        return map;
    });
    const [pinnedMessages, setPinnedMessages] = useState<Set<string>>(() => {
        const set = new Set<string>();
        for (const m of initialMessages) {
            if (m.pinned) set.add(m.id);
        }
        return set;
    });
    const [summary, setSummary] = useState<string | null>(initialSummary);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryCollapsed, setSummaryCollapsed] = useState(false);
    const [showContinuePanel, setShowContinuePanel] = useState(false);
    const [continueCount, setContinueCount] = useState(10);
    const [slashMenuOpen, setSlashMenuOpen] = useState(false);
    const [slashFilter, setSlashFilter] = useState("");
    const [slashSelected, setSlashSelected] = useState(0);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);
    const voiceBaseRef = useRef("");
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
    const synthRef = useRef<SpeechSynthesis | null>(null);
    const speakingMsgIdRef = useRef<string | null>(null);
    const isTTSEnabledRef = useRef(false);
    const prevIsBusyRef = useRef(false);

    // Keep selectedModelRef in sync for the transport closure
    useEffect(() => {
        selectedModelRef.current = selectedModel;
    }, [selectedModel]);

    // Keep activeKbIdsRef in sync for the transport closure
    useEffect(() => {
        activeKbIdsRef.current = activeKbIds;
    }, [activeKbIds]);

    // Keep activeToolIdsRef in sync for the transport closure
    useEffect(() => {
        activeToolIdsRef.current = activeToolIds;
    }, [activeToolIds]);

    // Keep personaIdRef in sync for the transport closure
    useEffect(() => {
        personaIdRef.current = activePersonaId ?? "";
    }, [activePersonaId]);

    // When allowed models change (e.g. admin updates config), reset selection
    useEffect(() => {
        if (allowedModels.length > 0) {
            setSelectedModel((prev) => allowedModels.find((m) => m.id === prev) ? prev : allowedModels[0].id);
        }
    }, [allowedModels]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, status]);

    // Close menus when clicking elsewhere
    useEffect(() => {
        if (!showExportMenu && !showSharePanel && !showModelDropdown && !showKbDropdown && !showToolsDropdown && !showContinuePanel && !showPersonaDropdown) return;
        const handler = () => { setShowExportMenu(false); setShowSharePanel(false); setShowModelDropdown(false); setShowKbDropdown(false); setShowToolsDropdown(false); setShowContinuePanel(false); setShowPersonaDropdown(false); };
        document.addEventListener("click", handler);
        return () => document.removeEventListener("click", handler);
    }, [showExportMenu, showSharePanel, showModelDropdown, showKbDropdown, showToolsDropdown, showContinuePanel, showPersonaDropdown]);

    useEffect(() => {
        setSpeechSupported(!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
        if ("speechSynthesis" in window) {
            setTtsSupported(true);
            synthRef.current = window.speechSynthesis;
        }
        return () => {
            recognitionRef.current?.stop();
            synthRef.current?.cancel();
            ttsAudioRef.current?.pause();
        };
    }, []);

    // Stop any in-progress server-TTS audio playback and release its object URL.
    const stopServerAudio = () => {
        const audio = ttsAudioRef.current;
        if (audio) {
            audio.pause();
            if (audio.src) URL.revokeObjectURL(audio.src);
            audio.src = "";
            ttsAudioRef.current = null;
        }
    };

    // Record from the mic and transcribe server-side via Whisper (/api/transcribe).
    const toggleRecording = async () => {
        if (isListening) {
            mediaRecorderRef.current?.stop();
            return;
        }
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            // Permission denied / no mic — fall back to browser speech recognition if available.
            if ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) toggleVoice();
            return;
        }
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        recorder.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            setIsListening(false);
            const chunks = audioChunksRef.current;
            audioChunksRef.current = [];
            const mime = recorder.mimeType || "audio/webm";
            const blob = new Blob(chunks, { type: mime });
            if (blob.size === 0) return;
            const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "mp4" : mime.includes("wav") ? "wav" : "webm";
            setIsTranscribing(true);
            try {
                const fd = new FormData();
                fd.append("audio", blob, `recording.${ext}`);
                const res = await fetch("/api/transcribe", { method: "POST", body: fd });
                if (res.ok) {
                    const data = await res.json();
                    const text = typeof data.text === "string" ? data.text.trim() : "";
                    if (text) setInput((prev) => (prev ? `${prev} ${text}` : text));
                }
            } catch { /* ignore network errors */ }
            finally { setIsTranscribing(false); }
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsListening(true);
    };

    const handleMicClick = () => {
        if (isTranscribing) return;
        if (serverSttEnabled && typeof MediaRecorder !== "undefined") {
            toggleRecording();
        } else {
            toggleVoice();
        }
    };

    const toggleVoice = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;
        const recognition = new SR();
        recognition.lang = "id-ID";
        recognition.interimResults = true;
        recognition.continuous = false;
        voiceBaseRef.current = input;
        recognition.onresult = (e: any) => {
            const transcript = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join("");
            setInput(voiceBaseRef.current + (voiceBaseRef.current ? " " : "") + transcript);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    };

    const isLLMBusy = status === "streaming" || status === "submitted";
    const isBusy = isLLMBusy || isGeneratingImage;
    // Voice availability: prefer server-side (Whisper / provider TTS) when enabled,
    // otherwise fall back to the browser's Web Speech API.
    const micAvailable = serverSttEnabled ? (typeof MediaRecorder !== "undefined") : speechSupported;
    const ttsAvailable = serverTtsEnabled || ttsSupported;
    const lastMessageIsUser = messages.length > 0 && messages[messages.length - 1].role === "user";
    const showTypingIndicator = isLLMBusy && lastMessageIsUser;

    const [typingWordIdx, setTypingWordIdx] = useState(0);
    useEffect(() => {
        if (!showTypingIndicator) return;
        const id = setInterval(() => setTypingWordIdx(i => (i + 1) % TYPING_WORDS.length), 1800);
        return () => clearInterval(id);
    }, [showTypingIndicator]);

    // Replace inline image markdown (potentially multi-megabyte data URLs from the
    // generate_image tool) with their alt text so TTS/export/clipboard stay sane.
    const stripInlineImages = (s: string): string =>
        s.replace(/!\[([^\]]*)\]\((?:data:[^)\s]+|https?:\/\/[^)\s]+)\)/g, (_m, alt) => alt || "[image]");

    const getMessageText = (m: any): string => {
        if (Array.isArray(m.parts)) {
            const textParts = m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("");
            if (textParts) return stripInlineImages(textParts);
        }
        if (typeof m.content === "string") {
            try {
                const parsed = JSON.parse(m.content);
                if (parsed && typeof parsed === "object" && "text" in parsed) return parsed.text ?? "";
            } catch {}
            return stripInlineImages(m.content);
        }
        return "";
    };

    // Read aloud via the configured TTS provider (/api/tts), playing the returned audio.
    const playServerTTS = async (messageId: string, text: string) => {
        if (!text.trim()) return;
        // Clicking the same message again stops playback (toggle).
        if (speakingMsgIdRef.current === messageId) {
            stopTTS();
            return;
        }
        stopServerAudio();
        synthRef.current?.cancel();
        speakingMsgIdRef.current = messageId;
        setSpeakingMessageId(messageId);
        try {
            const res = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });
            if (!res.ok) throw new Error("tts request failed");
            const blob = await res.blob();
            // The user may have toggled off / started another message while we waited.
            if (speakingMsgIdRef.current !== messageId) return;
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            ttsAudioRef.current = audio;
            const reset = () => {
                if (speakingMsgIdRef.current === messageId) {
                    speakingMsgIdRef.current = null;
                    setSpeakingMessageId(null);
                }
                stopServerAudio();
            };
            audio.onended = reset;
            audio.onerror = reset;
            await audio.play();
        } catch {
            if (speakingMsgIdRef.current === messageId) {
                speakingMsgIdRef.current = null;
                setSpeakingMessageId(null);
            }
        }
    };

    const speakMessage = (messageId: string, text: string) => {
        if (serverTtsEnabled) { playServerTTS(messageId, text); return; }
        if (!synthRef.current || !text.trim()) return;
        synthRef.current.cancel();
        if (speakingMsgIdRef.current === messageId) {
            speakingMsgIdRef.current = null;
            setSpeakingMessageId(null);
            return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => { speakingMsgIdRef.current = null; setSpeakingMessageId(null); };
        utterance.onerror = () => { speakingMsgIdRef.current = null; setSpeakingMessageId(null); };
        speakingMsgIdRef.current = messageId;
        setSpeakingMessageId(messageId);
        synthRef.current.speak(utterance);
    };

    const stopTTS = () => {
        synthRef.current?.cancel();
        stopServerAudio();
        speakingMsgIdRef.current = null;
        setSpeakingMessageId(null);
    };

    useEffect(() => { isTTSEnabledRef.current = isTTSEnabled; }, [isTTSEnabled]);

    useEffect(() => {
        if (prevIsBusyRef.current && !isLLMBusy && isTTSEnabledRef.current && !voiceModeOpen) {
            const lastAssistant = [...messages].reverse().find((m) => (m as any).role === "assistant");
            if (lastAssistant) {
                const msgText = getMessageText(lastAssistant);
                const msgId = (lastAssistant as ChatMessage).id;
                if (msgText) speakMessage(msgId, msgText);
            }
        }
        prevIsBusyRef.current = isLLMBusy;
    }, [isLLMBusy, messages]);

    // Persisted chats export server-side (full transcript + metadata, real PDF
    // binary). Guest / not-yet-saved chats fall back to in-browser export below.
    const handleExport = (format: "md" | "json" | "txt" | "pdf") => {
        if (!isGuest && chatIdRef.current) {
            const a = document.createElement("a");
            a.href = `/api/chats/${chatIdRef.current}/export?format=${format}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setShowExportMenu(false);
            return;
        }
        if (format === "pdf") exportPDF();
        else exportChat(format);
    };

    const exportChat = (format: "txt" | "md" | "json") => {
        const filename = (chatTitle || "chat").replace(/[^a-z0-9\-_\s]/gi, "").trim() || "chat";
        const visibleMessages = messages.filter((m) => (m as any).role !== "system");
        let content = "";
        let mimeType = "text/plain;charset=utf-8";

        if (format === "md") {
            content = `# ${chatTitle || "Chat"}\n\nExported: ${new Date().toLocaleString()}\n\n`;
            content += visibleMessages
                .map((m) => {
                    const label = m.role === "user" ? "**User**" : "**Assistant**";
                    return `${label}:\n\n${getMessageText(m)}`;
                })
                .join("\n\n---\n\n");
        } else if (format === "json") {
            const data = {
                title: chatTitle || "Chat",
                exportedAt: new Date().toISOString(),
                messageCount: visibleMessages.length,
                messages: visibleMessages.map((m) => ({
                    id: (m as ChatMessage).id,
                    role: m.role,
                    content: getMessageText(m),
                })),
            };
            content = JSON.stringify(data, null, 2);
            mimeType = "application/json;charset=utf-8";
        } else {
            content += visibleMessages
                .map((m) => {
                    const label = m.role === "user" ? "User" : "Assistant";
                    return `${label}:\n${getMessageText(m)}`;
                })
                .join("\n\n");
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filename}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        setShowExportMenu(false);
    };

    const exportPDF = () => {
        const visibleMessages = messages.filter((m) => (m as any).role !== "system");
        const title = chatTitle || "Chat";

        const esc = (s: string) =>
            s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const messagesHtml = visibleMessages
            .map((m) => {
                const isUser = m.role === "user";
                const label = isUser ? "User" : "Assistant";
                const text = esc(getMessageText(m)).replace(/\n/g, "<br>");
                return `<div class="msg ${isUser ? "u" : "a"}"><div class="lbl">${label}</div><div class="body">${text}</div></div>`;
            })
            .join("");

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:11pt;line-height:1.65;color:#111;padding:2cm;max-width:780px;margin:0 auto}
h1{font-size:17pt;margin-bottom:.3em}
.meta{font-size:9pt;color:#666;border-bottom:1px solid #ddd;padding-bottom:.8em;margin-bottom:1.8em}
.msg{margin-bottom:1.4em;page-break-inside:avoid}
.lbl{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.25em}
.msg.u .lbl{color:#2563eb}
.msg.a .lbl{color:#059669}
.body{white-space:pre-wrap;word-break:break-word}
@media print{body{padding:0}}
</style></head><body>
<h1>${esc(title)}</h1>
<div class="meta">Exported ${new Date().toLocaleString()} &bull; ${visibleMessages.length} message${visibleMessages.length !== 1 ? "s" : ""}</div>
${messagesHtml}
</body></html>`;

        const win = window.open("", "_blank");
        if (!win) return;
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 400);
        setShowExportMenu(false);
    };

    const handleEditMessage = async (message: ChatMessage, newText: string) => {
        if (isBusy) return;

        const idx = messages.findIndex((m: any) => m.id === message.id);

        // Truncate DB — fire and forget (don't block UX on network)
        if (idx !== -1 && chatIdRef.current && !isGuest) {
            fetch(`/api/chats/${chatIdRef.current}/truncate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keepCount: idx }),
            }).catch(() => {});
        }

        // Use SDK's built-in messageId to replace the message in-place and resend.
        // This avoids the two-step setMessages+sendMessage race in AI SDK v3.
        (sendMessage as any)({
            parts: [{ type: "text", text: newText }],
            messageId: message.id,
        });
        if (!isGuest) setTimeout(onMessageSent, 1500);
    };

    const handleReact = async (messageId: string, type: string) => {
        if (isGuest) return;
        // Optimistic update
        setReactions((prev) => {
            const current = prev[messageId] ?? [];
            const existingIdx = current.findIndex((r) => r.type === type);
            let updated: MessageReaction[];
            if (existingIdx >= 0 && current[existingIdx].userReacted) {
                // Remove reaction
                updated = current.map((r, i) =>
                    i === existingIdx ? { ...r, count: r.count - 1, userReacted: false } : r
                ).filter((r) => r.count > 0);
            } else {
                // Add reaction (and remove opposite for thumbs)
                let base = current;
                if (type === "thumbs_up") base = base.map((r) => r.type === "thumbs_down" ? { ...r, userReacted: false, count: Math.max(0, r.count - 1) } : r).filter((r) => r.count > 0);
                if (type === "thumbs_down") base = base.map((r) => r.type === "thumbs_up" ? { ...r, userReacted: false, count: Math.max(0, r.count - 1) } : r).filter((r) => r.count > 0);
                const existingType = base.findIndex((r) => r.type === type);
                if (existingType >= 0) {
                    updated = base.map((r, i) => i === existingType ? { ...r, count: r.count + 1, userReacted: true } : r);
                } else {
                    updated = [...base, { type, count: 1, userReacted: true }];
                }
            }
            return { ...prev, [messageId]: updated };
        });

        // Persist
        await fetch(`/api/messages/${messageId}/reactions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type }),
        }).catch(() => {});
    };

    const handlePin = async (messageId: string) => {
        if (isGuest) return;
        // Optimistic update
        setPinnedMessages((prev) => {
            const next = new Set(prev);
            if (next.has(messageId)) next.delete(messageId);
            else next.add(messageId);
            return next;
        });
        await fetch(`/api/messages/${messageId}/pin`, { method: "PATCH" }).catch(() => {});
    };

    const generateSummary = async () => {
        if (!chatIdRef.current || isGuest || summaryLoading) return;
        setSummaryLoading(true);
        setSummaryCollapsed(false);
        try {
            const res = await fetch(`/api/chats/${chatIdRef.current}/summary`, { method: "POST" });
            if (!res.ok) return;
            const data = await res.json();
            setSummary(data.summary ?? null);
        } catch { /* ignore */ }
        finally { setSummaryLoading(false); }
    };

    const handleFork = async (messageId: string) => {
        if (!chatIdRef.current || isGuest) return;
        try {
            const res = await fetch(`/api/chats/${chatIdRef.current}/fork`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messageId }),
            });
            if (!res.ok) return;
            const data = await res.json();
            onForkChat?.(data.chatId);
        } catch { /* ignore */ }
    };

    const handleContinueInNewChat = async () => {
        if (!chatIdRef.current || isGuest) return;
        try {
            const res = await fetch(`/api/chats/${chatIdRef.current}/continue`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ count: continueCount }),
            });
            if (!res.ok) return;
            const data = await res.json();
            setShowContinuePanel(false);
            onForkChat?.(data.chatId);
        } catch { /* ignore */ }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []).slice(0, 4 - pendingFiles.length);
        if (fileInputRef.current) fileInputRef.current.value = "";
        for (const file of files) {
            if (file.size > 20 * 1024 * 1024) continue;
            try {
                if (file.type.startsWith("image/")) {
                    const dataUrl = await compressImage(file);
                    setPendingFiles((prev) => [...prev, { dataUrl, name: file.name, kind: "image" }]);
                } else if (file.type === "application/pdf") {
                    const dataUrl = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (ev) => resolve(ev.target!.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                    setPendingFiles((prev) => [...prev, { dataUrl, name: file.name, kind: "pdf" }]);
                } else {
                    // Plain text / markdown / csv / json — read as text and inject
                    const text = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (ev) => resolve(ev.target!.result as string);
                        reader.onerror = reject;
                        reader.readAsText(file);
                    });
                    setPendingFiles((prev) => [...prev, { dataUrl: text, name: file.name, kind: "text" }]);
                }
            } catch { /* skip corrupt files */ }
        }
    };

    const removePendingFile = (idx: number) => {
        setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
    };

    const handleImageGeneration = async (text: string) => {
        if (imageGenError) setImageGenError(null);

        if (!chatIdRef.current && !isGuest && !incognito) {
            try {
                const res = await fetch("/api/chats", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: text }),
                });
                if (!res.ok) return;
                const chat = await res.json();
                chatIdRef.current = chat.id;
                onChatCreated(chat.id);
            } catch {
                return;
            }
        }

        const userMsgId = `user-img-${Date.now()}`;
        (setMessages as any)((prev: any[]) => [
            ...prev,
            { id: userMsgId, role: "user", content: text, parts: [{ type: "text", text }] },
        ]);

        setIsGeneratingImage(true);
        try {
            const res = await fetch("/api/generate-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: text, chatId: chatIdRef.current }),
            });

            if (!res.ok) {
                const errText = await res.text();
                setImageGenError(errText);
                return;
            }

            const { imageUrl, revisedPrompt } = await res.json();
            const assistantContent = JSON.stringify({
                type: "generated_image",
                text: revisedPrompt,
                files: [imageUrl],
            });

            (setMessages as any)((prev: any[]) => [
                ...prev,
                {
                    id: `assistant-img-${Date.now()}`,
                    role: "assistant",
                    content: assistantContent,
                    parts: [],
                },
            ]);

            if (!isGuest && !incognito) setTimeout(onMessageSent, 500);
        } catch (err) {
            setImageGenError(String(err));
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const text = input.trim();
        if ((!text && pendingFiles.length === 0) || isBusy) return;
        if (error) clearError();
        stopTTS();
        stopTyping();

        // Intercept image generation prompts (text-only, no file attachments)
        if (text && pendingFiles.length === 0 && isImageGenerationPrompt(text)) {
            setInput("");
            await handleImageGeneration(text);
            return;
        }

        if (!chatIdRef.current && !isGuest && !incognito) {
            try {
                const res = await fetch("/api/chats", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: text || "Chat with image" }),
                });
                if (!res.ok) return;
                const chat = await res.json();
                chatIdRef.current = chat.id;
                onChatCreated(chat.id);
            } catch {
                return;
            }
        }

        // Separate binary files (image/pdf) from text injections
        const binaryFiles = pendingFiles.filter((f) => f.kind === "image" || f.kind === "pdf");
        const textFiles = pendingFiles.filter((f) => f.kind === "text");

        // Build full message text: injected file contents prepended
        const injectedPrefix = textFiles
            .map((f) => `[File: ${f.name}]\n\`\`\`\n${f.dataUrl.slice(0, 8000)}\n\`\`\``)
            .join("\n\n");
        const fullText = injectedPrefix ? `${injectedPrefix}\n\n${text || ""}`.trim() : (text || " ");

        const filesToSend = binaryFiles.map((f) => f.dataUrl);
        pendingFilesRef.current = filesToSend;
        setInput("");
        setPendingFiles([]);

        const parts: any[] = [{ type: "text", text: fullText }];
        for (const f of binaryFiles) {
            parts.push({
                type: "file",
                mediaType: f.kind === "pdf" ? "application/pdf" : "image/jpeg",
                url: f.dataUrl,
            });
        }
        sendMessage({ role: "user", parts });
        if (!isGuest && !incognito) setTimeout(onMessageSent, 1500);
        pendingFilesRef.current = [];
    };

    const copyShareLink = async () => {
        if (!shareToken) return;
        const url = `${window.location.origin}/share/${shareToken}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleReplyCountChange = (messageId: string, count: number) => {
        setReplyCounts((prev) => ({ ...prev, [messageId]: count }));
    };

    const openArtifact = (artifact: Artifact, all: Artifact[]) => {
        setArtifactList(all);
        setActiveArtifact(artifact);
        setThreadMessage(null);
        setShowActionItems(false);
    };

    return (
        <div className="flex h-full relative overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0 relative">
            {/* Incognito indicator — conversation is never persisted */}
            {incognito && messages.length > 0 && (
                <div className={`absolute top-2.5 z-10 flex items-center gap-1.5 ${sidebarOpen ? "left-4" : "left-24"}`}>
                    <span className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-800/80 border border-gray-700 px-2.5 py-1 rounded-full">
                        <Ghost size={12} /> Incognito
                    </span>
                </div>
            )}
            {/* Presence — who else is currently viewing this collaborative chat */}
            {collabEnabled && viewers.length > 0 && (
                <div className={`absolute top-2.5 z-10 flex items-center gap-2 ${sidebarOpen ? "left-4" : "left-24"}`}>
                    <div className="flex -space-x-2">
                        {viewers.slice(0, 5).map((v) => (
                            <div
                                key={v.userId}
                                title={v.name ?? "Member"}
                                className="w-7 h-7 rounded-full ring-2 ring-gray-900 bg-gray-700 overflow-hidden flex items-center justify-center"
                            >
                                {v.image
                                    ? <img src={v.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    : <span className="text-[11px] font-medium text-gray-200">{(v.name ?? "?").charAt(0).toUpperCase()}</span>
                                }
                            </div>
                        ))}
                    </div>
                    {viewers.length > 5 && <span className="text-xs text-gray-500">+{viewers.length - 5}</span>}
                    <span className="text-xs text-green-400/80">online</span>
                </div>
            )}

            {messages.length > 0 && (
                <div className="absolute top-2 right-14 z-10 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {/* Branch switcher */}
                    {!isGuest && chatIdRef.current && onNavigateBranch && (
                        <BranchSwitcher
                            currentChatId={chatIdRef.current}
                            parentChat={parentChat}
                            childBranches={childBranches}
                            siblingBranches={siblingBranches}
                            onNavigate={onNavigateBranch}
                        />
                    )}
                    {/* Action Items button */}
                    {!isGuest && chatIdRef.current && (
                        <button
                            onClick={() => { setShowActionItems((v) => !v); setThreadMessage(null); }}
                            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors ${showActionItems ? "text-violet-400 hover:text-violet-300" : "text-gray-500 hover:text-gray-300"}`}
                        >
                            <ListTodo size={13} /> Tasks
                        </button>
                    )}
                    {/* Share button */}
                    {!isGuest && onShareToggle && (
                        <div className="relative">
                            <button
                                onClick={() => { setShowSharePanel((v) => !v); setShowExportMenu(false); }}
                                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors ${shareToken ? "text-blue-400 hover:text-blue-300" : "text-gray-500 hover:text-gray-300"}`}
                            >
                                <Share2 size={13} /> Share
                            </button>
                            {showSharePanel && (
                                <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden w-80 max-w-[calc(100vw-1rem)] p-4 space-y-3">
                                    {!shareToken ? (
                                        <>
                                            <p className="text-sm font-medium text-white">Share Chat</p>
                                            <p className="text-xs text-gray-400">Anyone with the link can view this conversation (read-only).</p>
                                            <div className="space-y-1">
                                                <label className="text-xs text-gray-400">Expiry date (optional)</label>
                                                <input
                                                    type="date"
                                                    value={shareExpiry}
                                                    min={new Date().toISOString().slice(0, 10)}
                                                    onChange={(e) => setShareExpiry(e.target.value)}
                                                    className="w-full px-2.5 py-1.5 text-xs bg-gray-700 border border-gray-600 rounded-lg text-gray-300 focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                            {chatIdRef.current && (
                                                <button
                                                    onClick={async () => { await onShareToggle(shareExpiry || null); }}
                                                    className="w-full px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                                                >
                                                    Enable Sharing
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-medium text-white">Chat Shared</p>
                                                {typeof shareViewCount === "number" && (
                                                    <span className="text-xs text-gray-400">{shareViewCount} view{shareViewCount !== 1 ? "s" : ""}</span>
                                                )}
                                            </div>
                                            {shareExpiresAt && (
                                                <p className="text-xs text-yellow-500">
                                                    Expires {new Date(shareExpiresAt).toLocaleDateString()}
                                                </p>
                                            )}
                                            <div className="flex gap-2">
                                                <input
                                                    readOnly
                                                    value={`${window.location.origin}/share/${shareToken}`}
                                                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-gray-700 border border-gray-600 rounded-lg text-gray-300 focus:outline-none"
                                                    onClick={(e) => (e.target as HTMLInputElement).select()}
                                                />
                                                <button
                                                    onClick={copyShareLink}
                                                    className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shrink-0"
                                                >
                                                    {copied ? "Copied!" : "Copy Link"}
                                                </button>
                                            </div>
                                            <button
                                                onClick={async () => { await onShareToggle(); setShowSharePanel(false); }}
                                                className="w-full px-3 py-2 text-sm text-gray-400 hover:text-red-400 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                                            >
                                                Stop Sharing
                                            </button>
                                        </>
                                    )}
                                    {onRevokeAllShares && (
                                        <div className="border-t border-gray-700 pt-3">
                                            <button
                                                onClick={async () => { await onRevokeAllShares(); setShowSharePanel(false); }}
                                                className="w-full px-3 py-2 text-xs text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                                            >
                                                Revoke all shares
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Summarize button */}
                    {!isGuest && chatIdRef.current && messages.filter((m) => (m as any).role !== "system").length >= 4 && (
                        <button
                            onClick={generateSummary}
                            disabled={summaryLoading || isBusy}
                            title="Generate conversation summary"
                            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <BookMarked size={13} className={summaryLoading ? "animate-pulse" : ""} />
                            {summaryLoading ? "Summarizing…" : "Summarize"}
                        </button>
                    )}

                    {/* Continue in new chat */}
                    {!isGuest && chatIdRef.current && (
                        <div className="relative">
                            <button
                                onClick={() => { setShowContinuePanel((v) => !v); setShowExportMenu(false); setShowSharePanel(false); }}
                                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                            >
                                <GitFork size={13} /> Continue
                            </button>
                            {showContinuePanel && (
                                <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl w-64 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                                    <p className="text-sm font-medium text-white">Continue in new chat</p>
                                    <p className="text-xs text-gray-400">Fork the last N messages into a fresh conversation.</p>
                                    <div className="space-y-2">
                                        <label className="text-xs text-gray-400">Messages to carry over</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {[4, 8, 12, 20].filter((n) => n < messages.filter((m) => (m as any).role !== "system").length).map((n) => (
                                                <button
                                                    key={n}
                                                    type="button"
                                                    onClick={() => setContinueCount(n)}
                                                    className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${continueCount === n ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                                                >
                                                    {n}
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={() => setContinueCount(messages.length)}
                                                className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${continueCount >= messages.filter((m) => (m as any).role !== "system").length ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                                            >
                                                All ({messages.filter((m) => (m as any).role !== "system").length})
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleContinueInNewChat}
                                        className="w-full px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                                    >
                                        Fork into new chat
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Hands-free voice mode (needs server STT + any TTS) */}
                    {serverSttEnabled && ttsAvailable && typeof MediaRecorder !== "undefined" && (
                        <button
                            onClick={() => setVoiceModeOpen(true)}
                            title="Hands-free voice conversation"
                            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                        >
                            <AudioLines size={13} /> Voice mode
                        </button>
                    )}

                    {/* TTS auto-read toggle */}
                    {ttsAvailable && (
                        <button
                            onClick={() => { setIsTTSEnabled((v) => !v); if (isTTSEnabled) stopTTS(); }}
                            title={isTTSEnabled ? "Disable auto-read" : "Auto-read AI responses aloud"}
                            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors ${isTTSEnabled ? "text-blue-400 hover:text-blue-300" : "text-gray-500 hover:text-gray-300"}`}
                        >
                            {isTTSEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                            {isTTSEnabled ? "Auto-read on" : "Auto-read"}
                        </button>
                    )}

                    {/* Export button */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowExportMenu((v) => !v); setShowSharePanel(false); }}
                            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                        >
                            <Download size={13} /> Export
                        </button>
                        {showExportMenu && (
                            <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden min-w-max">
                                <button
                                    onClick={() => handleExport("md")}
                                    className="block w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                                >
                                    Download as Markdown (.md)
                                </button>
                                <button
                                    onClick={() => handleExport("json")}
                                    className="block w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                                >
                                    Download as JSON (.json)
                                </button>
                                <button
                                    onClick={() => handleExport("txt")}
                                    className="block w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                                >
                                    Download as Plain Text (.txt)
                                </button>
                                <div className="border-t border-gray-700">
                                    <button
                                        onClick={() => handleExport("pdf")}
                                        className="block w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                                    >
                                        Export as PDF
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className={`flex-1 overflow-y-auto p-4 space-y-4 pb-28 ${!sidebarOpen ? "pt-14" : ""}`}>

                {/* Summary banner — shown once a summary exists or chat is long enough */}
                {messages.filter((m) => (m as any).role !== "system").length >= 4 && !isGuest && chatIdRef.current && (
                    <div className="max-w-3xl mx-auto w-full">
                        {summary ? (
                            <div className="rounded-xl border border-blue-800/50 bg-blue-950/30 overflow-hidden">
                                <button
                                    onClick={() => setSummaryCollapsed((v) => !v)}
                                    className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-blue-900/20 transition-colors"
                                >
                                    <span className="flex items-center gap-2 text-xs font-medium text-blue-400">
                                        <BookMarked size={13} />
                                        Conversation Summary
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); generateSummary(); }}
                                            title="Refresh summary"
                                            className="p-1 rounded text-blue-500 hover:text-blue-300 hover:bg-blue-800/40 transition-colors"
                                        >
                                            <RotateCcw size={11} className={summaryLoading ? "animate-spin" : ""} />
                                        </button>
                                        {summaryCollapsed ? <ChevronDown size={13} className="text-blue-500" /> : <ChevronUp size={13} className="text-blue-500" />}
                                    </div>
                                </button>
                                {!summaryCollapsed && (
                                    <p className="px-4 pb-3 text-sm text-blue-200/80 leading-relaxed">{summary}</p>
                                )}
                            </div>
                        ) : (
                            <button
                                onClick={generateSummary}
                                disabled={summaryLoading}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-dashed border-gray-700 text-xs text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors disabled:opacity-50"
                            >
                                <BookMarked size={13} />
                                {summaryLoading ? "Generating summary…" : "Generate conversation summary"}
                            </button>
                        )}
                    </div>
                )}

                {messages.length === 0 ? null : (
                    messages.map((m, idx) => {
                        let isLastRegeneratable = false;
                        if (!isBusy && (m as any).role === "assistant" && idx === messages.length - 1) {
                            try {
                                const parsed = JSON.parse((m as ChatMessage).content ?? "");
                                isLastRegeneratable = parsed?.type !== "generated_image";
                            } catch {
                                isLastRegeneratable = true;
                            }
                        }
                        const msgId = (m as ChatMessage).id;
                        const msgReactions = reactions[msgId] ?? (m as ChatMessage).reactions ?? [];
                        // In collaborative chats, attribute a user message authored by someone else.
                        const cm = m as ChatMessage;
                        const isOtherAuthor = collabEnabled && cm.role === "user" && !!cm.authorId && cm.authorId !== currentUserId;
                        return (
                            <MessageBubble
                                key={m.id}
                                message={{ ...(m as ChatMessage), reactions: msgReactions }}
                                authorLabel={isOtherAuthor ? (cm.authorName ?? "Member") : undefined}
                                authorImage={isOtherAuthor ? (cm.authorImage ?? undefined) : undefined}
                                onEdit={!isBusy && (m as any).role === "user"
                                    ? (newText) => handleEditMessage(m as ChatMessage, newText)
                                    : undefined}
                                onRegenerate={isLastRegeneratable ? () => { clearError(); regenerate(); } : undefined}
                                onFork={!isBusy && !isGuest && chatIdRef.current
                                    ? () => handleFork(msgId)
                                    : undefined}
                                onReply={!isGuest && chatIdRef.current
                                    ? () => setThreadMessage(m as ChatMessage)
                                    : undefined}
                                onReact={!isGuest && !incognito && (m as any).role === "assistant"
                                    ? handleReact
                                    : undefined}
                                onPin={!isGuest && chatIdRef.current ? handlePin : undefined}
                                pinned={pinnedMessages.has(msgId)}
                                replyCount={replyCounts[msgId] ?? (m as ChatMessage).replyCount ?? 0}
                                onSpeak={ttsAvailable && (m as any).role === "assistant"
                                    ? () => speakMessage(msgId, getMessageText(m))
                                    : undefined}
                                isSpeaking={speakingMessageId === msgId}
                                onOpenArtifact={(m as any).role === "assistant" ? openArtifact : undefined}
                                activeArtifactId={activeArtifact?.id ?? null}
                            />
                        );
                    })
                )}

                {showTypingIndicator && (
                    <div className="flex gap-3 max-w-3xl mx-auto w-full">
                        <div className="px-4 py-3 rounded-2xl bg-gray-800 text-sm flex items-center gap-1">
                            <span className="text-gray-300 capitalize">{TYPING_WORDS[typingWordIdx]}</span>
                            <span className="inline-flex gap-0.5 text-gray-500">
                                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                            </span>
                        </div>
                    </div>
                )}

                {isGeneratingImage && (
                    <div className="flex gap-3 max-w-3xl mx-auto w-full">
                        <div className="px-4 py-3 rounded-2xl bg-gray-800 text-sm flex items-center gap-2.5">
                            <Sparkles size={14} className="text-purple-400 animate-pulse shrink-0" />
                            <span className="text-gray-300">Membuat gambar...</span>
                        </div>
                    </div>
                )}

                {imageGenError && !isGeneratingImage && (
                    <div className="flex gap-3 max-w-3xl mx-auto w-full">
                        <div className="w-8 h-8 flex items-center justify-center rounded-full bg-red-900 shrink-0 mt-1">
                            <AlertCircle size={18} className="text-red-400" />
                        </div>
                        <div className="flex-1 px-4 py-3 rounded-2xl bg-red-950 border border-red-900 text-sm">
                            <p className="text-red-400 mb-1">Gagal membuat gambar</p>
                            <p className="text-red-500 text-xs">{imageGenError}</p>
                            <button
                                onClick={() => setImageGenError(null)}
                                className="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                )}

                {status === "error" && error && (
                    <div className="flex gap-3 max-w-3xl mx-auto w-full">
                        <div className="w-8 h-8 flex items-center justify-center rounded-full bg-red-900 shrink-0 mt-1">
                            <AlertCircle size={18} className="text-red-400" />
                        </div>
                        <div className="flex-1 px-4 py-3 rounded-2xl bg-red-950 border border-red-900 text-sm">
                            <p className="text-red-400 mb-2">An error occurred: {error.message}</p>
                            <button
                                onClick={() => { clearError(); regenerate(); }}
                                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
                            >
                                <RefreshCw size={12} /> Try again
                            </button>
                        </div>
                    </div>
                )}

                {/* Collaboration: AI responding to another member */}
                {collabEnabled && respondingName && (
                    <div className="flex gap-3 max-w-3xl mx-auto w-full">
                        <div className="px-4 py-3 rounded-2xl bg-gray-800 text-sm flex items-center gap-2">
                            <Bot size={14} className="text-blue-400 shrink-0" />
                            <span className="text-gray-300">Responding to {respondingName}</span>
                            <span className="inline-flex gap-0.5 text-gray-500">
                                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                            </span>
                        </div>
                    </div>
                )}

                {/* Collaboration: other members typing */}
                {collabEnabled && typingUsers.length > 0 && (
                    <div className="max-w-3xl mx-auto w-full">
                        <span className="text-xs text-gray-500 italic">
                            {typingUsers.length === 1
                                ? `${typingUsers[0].name ?? "Someone"} is typing…`
                                : `${typingUsers.length} people are typing…`}
                        </span>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            <div className={messages.length === 0
                ? "absolute inset-0 flex flex-col items-center justify-center p-4 pointer-events-none"
                : "absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-900 via-gray-900/95 to-transparent"}>
                <div className={`w-full max-w-3xl mx-auto space-y-2 ${messages.length === 0 ? "pointer-events-auto" : ""}`}>
                    {/* Centered greeting — claude.ai style, shown only on an empty chat */}
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center text-center pb-4">
                            {incognito ? (
                                <>
                                    <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                                        <Ghost size={24} className="text-gray-400" />
                                    </div>
                                    <h2 className="text-2xl font-bold mb-2 text-gray-300">Incognito chat</h2>
                                    <p className="text-sm text-gray-600 max-w-sm">This conversation won&apos;t be saved to your history, and no memories will be stored from it.</p>
                                </>
                            ) : (
                                <>
                                    <img src="/logo.png" alt="" className="w-12 h-12 object-contain opacity-40 mb-4" />
                                    <h2 className="text-2xl font-bold text-gray-400">What can I help you with?</h2>
                                </>
                            )}
                        </div>
                    )}

                    {/* Model selector */}
                    {multiModelEnabled && !isGuest && allowedModels.length > 1 && (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Bot size={13} className="text-gray-500 shrink-0" />
                            <span className="text-xs text-gray-500">Model:</span>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowModelDropdown((v) => !v)}
                                    className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-500 transition-colors"
                                >
                                    <span className="max-w-48 truncate">
                                        {allowedModels.find((m) => m.id === selectedModel)?.name || "Select model"}
                                    </span>
                                    <ChevronDown size={11} className={`transition-transform shrink-0 ${showModelDropdown ? "rotate-180" : ""}`} />
                                </button>
                                {showModelDropdown && (
                                    <div className="absolute bottom-full mb-1 left-0 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-48 max-w-72 z-10">
                                        {allowedModels.map((m) => (
                                            <button
                                                key={m.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedModel(m.id);
                                                    selectedModelRef.current = m.id;
                                                    setShowModelDropdown(false);
                                                }}
                                                className={`block w-full text-left px-3 py-2 text-sm transition-colors ${
                                                    selectedModel === m.id
                                                        ? "bg-blue-600 text-white"
                                                        : "text-gray-300 hover:bg-gray-700"
                                                }`}
                                            >
                                                {m.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* Compare mode — fan one prompt out to multiple models side by side */}
                            <button
                                type="button"
                                onClick={() => setShowCompare(true)}
                                title="Compare models side by side"
                                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-500 transition-colors"
                            >
                                <GitCompare size={12} /> Compare
                            </button>
                        </div>
                    )}

                    {/* Knowledge Base selector */}
                    {!isGuest && knowledgeBases.length > 0 && (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <BookOpen size={13} className="text-gray-500 shrink-0" />
                            <span className="text-xs text-gray-500">KB:</span>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowKbDropdown((v) => !v)}
                                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-gray-800 border transition-colors ${activeKbIds.length > 0 ? "border-blue-600 text-blue-400 hover:border-blue-500" : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"}`}
                                >
                                    <span>{activeKbIds.length > 0 ? `${activeKbIds.length} active` : "None"}</span>
                                    <ChevronDown size={11} className={`transition-transform shrink-0 ${showKbDropdown ? "rotate-180" : ""}`} />
                                </button>
                                {showKbDropdown && (
                                    <div className="absolute bottom-full mb-1 left-0 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-48 max-w-72 z-10">
                                        <p className="px-3 py-2 text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-700">Knowledge Bases</p>
                                        {knowledgeBases.map((kb) => {
                                            const isActive = activeKbIds.includes(kb.id);
                                            const readyDocs = kb.documents.filter((d) => d.status === "ready").length;
                                            return (
                                                <button
                                                    key={kb.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setActiveKbIds((prev) =>
                                                            isActive ? prev.filter((id) => id !== kb.id) : [...prev, kb.id]
                                                        );
                                                    }}
                                                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                                                >
                                                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${isActive ? "bg-blue-600 border-blue-600" : "border-gray-600"}`}>
                                                        {isActive && <Check size={10} className="text-white" />}
                                                    </div>
                                                    <span className="flex-1 text-left truncate">{kb.name}</span>
                                                    <span className="text-xs text-gray-500 shrink-0">{readyDocs} doc{readyDocs !== 1 ? "s" : ""}</span>
                                                </button>
                                            );
                                        })}
                                        {activeKbIds.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setActiveKbIds([])}
                                                className="w-full px-3 py-2 text-xs text-gray-500 hover:text-gray-300 border-t border-gray-700 transition-colors"
                                            >
                                                Clear all
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Tools selector */}
                    {!isGuest && toolsEnabled && availableTools.length > 0 && (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Wrench size={13} className="text-gray-500 shrink-0" />
                            <span className="text-xs text-gray-500">Tools:</span>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowToolsDropdown((v) => !v)}
                                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-gray-800 border transition-colors ${activeToolIds.length > 0 ? "border-purple-600 text-purple-400 hover:border-purple-500" : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"}`}
                                >
                                    <span>{activeToolIds.length > 0 ? `${activeToolIds.length} active` : "None"}</span>
                                    <ChevronDown size={11} className={`transition-transform shrink-0 ${showToolsDropdown ? "rotate-180" : ""}`} />
                                </button>
                                {showToolsDropdown && (
                                    <div className="absolute bottom-full mb-1 left-0 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-52 max-w-80 z-10">
                                        <p className="px-3 py-2 text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-700">Agent Tools</p>
                                        {availableTools.map((t) => {
                                            const isActive = activeToolIds.includes(t.id);
                                            return (
                                                <button
                                                    key={t.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setActiveToolIds((prev) =>
                                                            isActive ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                                                        );
                                                    }}
                                                    className="flex items-start gap-2.5 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                                                >
                                                    <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 border ${isActive ? "bg-purple-600 border-purple-600" : "border-gray-600"}`}>
                                                        {isActive && <Check size={10} className="text-white" />}
                                                    </div>
                                                    <div className="text-left">
                                                        <div className="font-medium">{t.name}</div>
                                                        <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                        {activeToolIds.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setActiveToolIds([])}
                                                className="w-full px-3 py-2 text-xs text-gray-500 hover:text-gray-300 border-t border-gray-700 transition-colors"
                                            >
                                                Disable all
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Persona selector */}
                    {!isGuest && personas.length > 0 && (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Theater size={13} className="text-gray-500 shrink-0" />
                            <span className="text-xs text-gray-500">Persona:</span>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowPersonaDropdown((v) => !v)}
                                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-gray-800 border transition-colors ${activePersonaId ? "border-violet-600 text-violet-400 hover:border-violet-500" : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"}`}
                                >
                                    <span className="max-w-48 truncate">
                                        {activePersonaId ? (personas.find(p => p.id === activePersonaId)?.name ?? "Unknown") : "Default"}
                                    </span>
                                    <ChevronDown size={11} className={`transition-transform shrink-0 ${showPersonaDropdown ? "rotate-180" : ""}`} />
                                </button>
                                {showPersonaDropdown && (
                                    <div className="absolute bottom-full mb-1 left-0 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-52 max-w-72 z-10">
                                        <p className="px-3 py-2 text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-700">Persona</p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setActivePersonaId(null);
                                                personaIdRef.current = "";
                                                setShowPersonaDropdown(false);
                                                if (chatIdRef.current && !isGuest) {
                                                    fetch(`/api/chats/${chatIdRef.current}`, {
                                                        method: "PATCH",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ activePersonaId: null }),
                                                    }).catch(() => {});
                                                }
                                            }}
                                            className={`block w-full text-left px-3 py-2 text-sm transition-colors ${!activePersonaId ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
                                        >
                                            Default (no persona)
                                        </button>
                                        {personas.map((p) => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => {
                                                    setActivePersonaId(p.id);
                                                    personaIdRef.current = p.id;
                                                    setShowPersonaDropdown(false);
                                                    if (chatIdRef.current && !isGuest) {
                                                        fetch(`/api/chats/${chatIdRef.current}`, {
                                                            method: "PATCH",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ activePersonaId: p.id }),
                                                        }).catch(() => {});
                                                    }
                                                }}
                                                className={`block w-full text-left px-3 py-2.5 text-sm transition-colors ${activePersonaId === p.id ? "bg-violet-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
                                            >
                                                <div className="font-medium truncate">{p.name}</div>
                                                {p.description && <div className={`text-xs mt-0.5 truncate ${activePersonaId === p.id ? "text-violet-200" : "text-gray-500"}`}>{p.description}</div>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* File previews */}
                    {pendingFiles.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                            {pendingFiles.map((f, i) => (
                                <div key={i} className="relative group">
                                    {f.kind === "image" ? (
                                        <img
                                            src={f.dataUrl}
                                            alt={f.name}
                                            className="w-16 h-16 object-cover rounded-lg border border-gray-600"
                                        />
                                    ) : (
                                        <div className="w-16 h-16 flex flex-col items-center justify-center rounded-lg border border-gray-600 bg-gray-800 gap-1">
                                            <FileText size={22} className={f.kind === "pdf" ? "text-red-400" : "text-blue-400"} />
                                            <span className="text-[9px] text-gray-400 truncate max-w-[56px] px-0.5">{f.name}</span>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => removePendingFile(i)}
                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="relative">
                    {slashMenuOpen && (() => {
                        const filtered = slashCommands.filter(c =>
                            !slashFilter || c.command.startsWith(slashFilter) || c.description.toLowerCase().includes(slashFilter.toLowerCase())
                        );
                        return filtered.length > 0 ? (
                            <div className="absolute bottom-full mb-2 left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-50">
                                {filtered.map((cmd, i) => (
                                    <button
                                        key={cmd.id}
                                        type="button"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            const userText = input.slice(input.indexOf(" ") + 1);
                                            const filled = cmd.prompt.includes("{input}")
                                                ? cmd.prompt.replace("{input}", userText)
                                                : cmd.prompt;
                                            setInput(filled);
                                            setSlashMenuOpen(false);
                                        }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                                            i === slashSelected ? "bg-blue-600/20 text-white" : "hover:bg-gray-700 text-gray-200"
                                        }`}
                                    >
                                        <span className="font-mono text-blue-300 text-sm shrink-0">/{cmd.command}</span>
                                        {cmd.description && <span className="text-gray-400 text-sm truncate">{cmd.description}</span>}
                                    </button>
                                ))}
                            </div>
                        ) : null;
                    })()}
                    <form onSubmit={handleSubmit} className="flex gap-2 relative">
                        {allowFileUpload && (
                            <>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv,application/json"
                                    multiple
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                                <button
                                    type="button"
                                    disabled={isBusy || pendingFiles.length >= 4}
                                    onClick={() => { if (!isBusy) fileInputRef.current?.click(); }}
                                    title="Lampirkan gambar, PDF, atau file teks"
                                    className="shrink-0 self-center p-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Paperclip size={18} />
                                </button>
                            </>
                        )}
                        <input
                            className={`flex-1 p-4 ${micAvailable ? "pr-24" : "pr-12"} rounded-xl bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed`}
                            value={input}
                            disabled={isGeneratingImage}
                            placeholder={isGeneratingImage ? "Membuat gambar..." : pendingFiles.length > 0 ? "Add a caption (optional)..." : slashCommands.length > 0 ? "Type / for commands or a message..." : "Type a message..."}
                            maxLength={4000}
                            onChange={(e) => {
                                const val = e.target.value;
                                setInput(val);
                                if (val.trim()) notifyTyping();
                                if (val.startsWith("/") && slashCommands.length > 0) {
                                    const spaceIdx = val.indexOf(" ");
                                    const filter = spaceIdx === -1 ? val.slice(1) : val.slice(1, spaceIdx);
                                    setSlashFilter(filter);
                                    setSlashSelected(0);
                                    setSlashMenuOpen(true);
                                } else {
                                    setSlashMenuOpen(false);
                                }
                            }}
                            onKeyDown={(e) => {
                                if (slashMenuOpen) {
                                    const filtered = slashCommands.filter(c =>
                                        !slashFilter || c.command.startsWith(slashFilter) || c.description.toLowerCase().includes(slashFilter.toLowerCase())
                                    );
                                    if (e.key === "ArrowDown") {
                                        e.preventDefault();
                                        setSlashSelected(i => Math.min(i + 1, filtered.length - 1));
                                        return;
                                    }
                                    if (e.key === "ArrowUp") {
                                        e.preventDefault();
                                        setSlashSelected(i => Math.max(i - 1, 0));
                                        return;
                                    }
                                    if (e.key === "Escape") {
                                        e.preventDefault();
                                        setSlashMenuOpen(false);
                                        return;
                                    }
                                    if (e.key === "Enter" || e.key === "Tab") {
                                        const cmd = filtered[slashSelected];
                                        if (cmd) {
                                            e.preventDefault();
                                            const userText = input.slice(input.indexOf(" ") + 1);
                                            const filled = cmd.prompt.includes("{input}")
                                                ? cmd.prompt.replace("{input}", userText)
                                                : cmd.prompt;
                                            setInput(filled);
                                            setSlashMenuOpen(false);
                                            return;
                                        }
                                    }
                                }
                                if (e.key === "Enter" && (!e.shiftKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    handleSubmit(e as unknown as React.FormEvent);
                                }
                            }}
                        />
                        {micAvailable && (
                            <button
                                type="button"
                                onClick={handleMicClick}
                                disabled={isBusy || isTranscribing}
                                title={isTranscribing ? "Mentranskripsi…" : isListening ? "Hentikan rekaman suara" : "Input suara"}
                                className={`absolute right-[52px] top-2 bottom-2 w-10 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                    isListening ? "bg-red-600 hover:bg-red-700 text-white animate-pulse" : "text-gray-400 hover:text-white hover:bg-gray-700"
                                }`}
                            >
                                {isTranscribing ? <Loader2 size={16} className="animate-spin" /> : isListening ? <MicOff size={16} /> : <Mic size={16} />}
                            </button>
                        )}
                        {isLLMBusy ? (
                            <button
                                type="button"
                                onClick={stop}
                                title="Hentikan streaming"
                                className="absolute right-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                            >
                                <Square size={16} fill="currentColor" />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={(!input.trim() && pendingFiles.length === 0) || isGeneratingImage}
                                className="absolute right-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Send size={18} />
                            </button>
                        )}
                    </form>
                    </div>

                    {/* Conversation starters — centered under the input on an empty chat */}
                    {messages.length === 0 && conversationTemplates.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                            {conversationTemplates.map((tpl) => (
                                <button
                                    key={tpl.id}
                                    onClick={() => setInput(tpl.prompt)}
                                    className="text-left px-4 py-3 rounded-xl border border-gray-700 bg-gray-800/50 hover:bg-gray-700/60 hover:border-gray-600 transition-colors group"
                                >
                                    <p className="text-sm font-medium text-gray-300 group-hover:text-white leading-snug">{tpl.name}</p>
                                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{tpl.prompt}</p>
                                </button>
                            ))}
                        </div>
                    )}

                    {messages.length > 0 && (
                        <p className="text-center text-xs text-gray-600">Hakerek can make mistakes. Verify important information.</p>
                    )}
                </div>
            </div>
        </div>

        {/* Thread panel — slides in from the right */}
        {threadMessage && chatIdRef.current && (
            <ThreadPanel
                chatId={chatIdRef.current}
                parentMessage={threadMessage}
                onClose={() => setThreadMessage(null)}
                onReplyCountChange={handleReplyCountChange}
                isGuest={isGuest}
                selectedModel={selectedModel}
            />
        )}

        {/* Action Items panel — slides in from the right */}
        {showActionItems && chatIdRef.current && (
            <ActionItemsPanel
                chatId={chatIdRef.current}
                onClose={() => setShowActionItems(false)}
            />
        )}

        {/* Artifact / code canvas — split view on the right */}
        {activeArtifact && (
            <ArtifactCanvas
                artifact={activeArtifact}
                artifacts={artifactList}
                onSelect={setActiveArtifact}
                onClose={() => setActiveArtifact(null)}
            />
        )}

        {/* Compare mode — full-screen side-by-side multi-model comparison */}
        {showCompare && (
            <CompareView
                allowedModels={allowedModels}
                initialPrompt={input}
                onClose={() => setShowCompare(false)}
            />
        )}

        {/* Hands-free conversational voice mode — shares this useChat instance */}
        {voiceModeOpen && (
            <VoiceModeOverlay
                status={status}
                messages={messages}
                sendMessage={sendMessage}
                stop={stop}
                getMessageText={getMessageText}
                serverTtsEnabled={serverTtsEnabled}
                ttsSupported={ttsSupported}
                onClose={() => { setVoiceModeOpen(false); stopTTS(); }}
            />
        )}
        </div>
    );
}
