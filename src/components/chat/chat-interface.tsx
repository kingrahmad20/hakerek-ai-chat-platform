/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { PanelLeftOpen, PanelLeftClose, SquarePen, Search, ChevronDown, Building2, Settings, Pin, Archive, FolderPlus, Ghost } from "lucide-react";
import { ChatSidebar } from "./chat-sidebar";
import { ChatWindow } from "./chat-window";
import { SettingsModal, type SettingsTab } from "@/components/settings/settings-modal";
import { NotificationBell } from "@/components/chat/notification-bell";
import { CreateWorkspaceModal } from "@/components/workspace/create-workspace-modal";
import { WorkspaceSettingsModal } from "@/components/workspace/workspace-settings-modal";
import { CommandPalette, type PaletteItem } from "@/components/chat/command-palette";
import { useTheme } from "@/components/providers/theme-provider";
import type { ChatSummary, ChatMessage, ChatParticipant, UserInfo, WorkspaceSummary, KnowledgeBaseSummary } from "@/types";

interface AllowedModel {
    id: string;
    name: string;
}

interface WindowState {
    chatId: string | null;
    initialMessages: ChatMessage[];
    initialSummary?: string | null;
    initialPersonaId?: string | null;
    isCollaborative?: boolean;
    participants?: ChatParticipant[];
    incognito?: boolean;
}

function getLastUpdated(ws: WorkspaceSummary): string {
    let latest = 0;
    for (const folder of ws.folders) {
        for (const chat of folder.chats) {
            const t = new Date(chat.updatedAt).getTime();
            if (t > latest) latest = t;
        }
    }
    if (!latest) return "";
    const diff = Date.now() - latest;
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Updated today";
    if (days === 1) return "Updated yesterday";
    if (days < 7) return `Updated ${days} days ago`;
    if (days < 30) return `Updated ${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
    if (days < 365) return `Updated ${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? "s" : ""} ago`;
    return `Updated ${Math.floor(days / 365)} year${Math.floor(days / 365) > 1 ? "s" : ""} ago`;
}

function getLatestTimestamp(ws: WorkspaceSummary): number {
    let latest = 0;
    for (const folder of ws.folders) {
        for (const chat of folder.chats) {
            const t = new Date(chat.updatedAt).getTime();
            if (t > latest) latest = t;
        }
    }
    return latest;
}

function ProjectsGrid({
    workspaces,
    onCreateWorkspace,
    onOpenWorkspaceSettings,
}: {
    workspaces: WorkspaceSummary[];
    onCreateWorkspace: () => void;
    onOpenWorkspaceSettings: (id: string) => void;
}) {
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState<"activity" | "name">("activity");

    const filtered = workspaces
        .filter(ws =>
            ws.name.toLowerCase().includes(search.toLowerCase()) ||
            (ws.description ?? "").toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) =>
            sortBy === "name"
                ? a.name.localeCompare(b.name)
                : getLatestTimestamp(b) - getLatestTimestamp(a)
        );

    return (
        <div className="flex-1 flex flex-col overflow-y-auto bg-gray-900">
            <div className="max-w-4xl mx-auto w-full px-8 pt-8 pb-12">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-semibold text-white">Projects</h1>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            Sort by
                            <button
                                onClick={() => setSortBy(s => s === "activity" ? "name" : "activity")}
                                className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1.5 rounded-lg text-white text-sm transition-colors"
                            >
                                {sortBy === "activity" ? "Activity" : "Name"}
                                <ChevronDown size={14} />
                            </button>
                        </div>
                        <button
                            onClick={onCreateWorkspace}
                            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 rounded-lg text-sm font-medium transition-colors"
                        >
                            New project
                        </button>
                    </div>
                </div>

                <div className="relative mb-6">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search projects..."
                        className="w-full pl-9 pr-4 py-2.5 bg-gray-800/60 border border-gray-700/50 rounded-xl text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-600 transition-colors"
                    />
                </div>

                {filtered.length === 0 && search === "" ? (
                    <div className="text-center py-16">
                        <Building2 size={40} className="text-gray-700 mx-auto mb-4" />
                        <p className="text-gray-500 text-sm mb-4">No projects yet</p>
                        <button onClick={onCreateWorkspace} className="px-4 py-2 bg-white text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors">
                            Create your first project
                        </button>
                    </div>
                ) : filtered.length === 0 ? (
                    <p className="text-center text-sm text-gray-600 py-8">No results for &ldquo;{search}&rdquo;</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {filtered.map(ws => {
                            const lastUpdated = getLastUpdated(ws);
                            return (
                                <button
                                    key={ws.id}
                                    onClick={() => onOpenWorkspaceSettings(ws.id)}
                                    className="text-left bg-gray-800/60 hover:bg-gray-800 border border-gray-700/40 hover:border-gray-600/60 rounded-xl p-5 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                        <span className="font-semibold text-white leading-tight">{ws.name}</span>
                                        {ws.myRole === "OWNER" && (
                                            <span className="shrink-0 text-[11px] px-2 py-0.5 bg-gray-700/80 rounded-full text-gray-400 border border-gray-600/40">
                                                Owner
                                            </span>
                                        )}
                                    </div>
                                    {ws.description && (
                                        <p className="text-sm text-gray-400 mb-3 line-clamp-2 leading-relaxed">{ws.description}</p>
                                    )}
                                    {lastUpdated && (
                                        <p className="text-xs text-gray-500">{lastUpdated}</p>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

interface ConversationTemplate {
    id: string;
    name: string;
    prompt: string;
    enabled: boolean;
}

interface SlashCommandDef {
    id: string;
    command: string;
    description: string;
    prompt: string;
}

interface PersonaDef {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
}

export default function ChatInterface({ user, allowFileUpload = false, appName = "Hakerek", subscriptionEnabled = false, conversationTemplates = [], slashCommands = [], personas = [] }: { user: UserInfo | null; allowFileUpload?: boolean; appName?: string; subscriptionEnabled?: boolean; conversationTemplates?: ConversationTemplate[]; slashCommands?: SlashCommandDef[]; personas?: PersonaDef[] }) {
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [chatList, setChatList] = useState<ChatSummary[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [allowedModels, setAllowedModels] = useState<AllowedModel[]>([]);
    const [multiModelEnabled, setMultiModelEnabled] = useState(false);
    const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
    const [showProjectsView, setShowProjectsView] = useState(false);
    const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
    const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(null);
    const [trashList, setTrashList] = useState<ChatSummary[]>([]);

    useEffect(() => {
        if (window.innerWidth < 1024) setSidebarOpen(false);
    }, []);
    const [loadingChat, setLoadingChat] = useState(false);
    const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
    const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>([]);
    const [toolsEnabled, setToolsEnabled] = useState(false);
    const [availableTools, setAvailableTools] = useState<{ id: string; name: string; description: string }[]>([]);
    const [serverSttEnabled, setServerSttEnabled] = useState(false);
    const [serverTtsEnabled, setServerTtsEnabled] = useState(false);
    const [showCommandPalette, setShowCommandPalette] = useState(false);

    // Stable mount counter — each window gets a unique mountId as React key
    const mountCounter = useRef(0);
    const [activeMount, setActiveMount] = useState<string>("m0");
    const activeMountRef = useRef("m0");
    // Track which mounts are still streaming so we don't unmount them early
    const streamingMounts = useRef<Set<string>>(new Set());

    // Map<mountId, WindowState> — each mounted ChatWindow lives here
    const [windows, setWindows] = useState<Map<string, WindowState>>(
        () => new Map([["m0", { chatId: null, initialMessages: [] }]])
    );

    const switchMount = (mountId: string, chatId: string | null) => {
        activeMountRef.current = mountId;
        setActiveMount(mountId);
        setActiveChatId(chatId);
    };

    const loadChats = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch("/api/chats");
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data)) setChatList(data);
        } catch { /* ignore */ }
    }, [user]);

    const loadWorkspaces = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch("/api/workspaces");
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data)) setWorkspaces(data);
        } catch { /* ignore */ }
    }, [user]);

    const loadKnowledgeBases = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch("/api/knowledge");
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data)) setKnowledgeBases(data);
        } catch { /* ignore */ }
    }, [user]);

    const loadTrash = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch("/api/chats/trash");
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data)) setTrashList(data);
        } catch { /* ignore */ }
    }, [user]);

    useEffect(() => { loadChats(); }, [loadChats]);
    useEffect(() => { loadWorkspaces(); }, [loadWorkspaces]);

    // Apply workspace branding when the active chat belongs to a workspace
    const { setWorkspaceOverride } = useTheme();
    const activeWorkspace = useMemo(() => {
        if (!activeChatId) return null;
        for (const ws of workspaces) {
            for (const folder of ws.folders) {
                if (folder.chats.some((c) => c.id === activeChatId)) return ws;
            }
        }
        return null;
    }, [activeChatId, workspaces]);

    useEffect(() => {
        if (activeWorkspace?.theme) {
            setWorkspaceOverride(activeWorkspace.theme as "dark" | "light", activeWorkspace.primaryColor ?? null);
        } else {
            setWorkspaceOverride(null, null);
        }
    }, [activeWorkspace, setWorkspaceOverride]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                setShowCommandPalette(prev => !prev);
                return;
            }
            const target = e.target as HTMLElement;
            const inInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
            if (e.key === "/" && !inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                setShowCommandPalette(true);
                return;
            }
            if (e.key === "Escape") {
                setShowCommandPalette(false);
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, []);
    useEffect(() => { loadKnowledgeBases(); }, [loadKnowledgeBases]);
    useEffect(() => { loadTrash(); }, [loadTrash]);

    useEffect(() => {
        if (!user) return;
        fetch("/api/settings/models")
            .then((res) => res.json())
            .then((data) => {
                setMultiModelEnabled(data.enabled ?? false);
                setAllowedModels(data.models ?? []);
            })
            .catch(() => {});
    }, [user]);

    useEffect(() => {
        if (!user) return;
        fetch("/api/settings/tools")
            .then((res) => res.json())
            .then((data) => {
                setToolsEnabled(data.enabled ?? false);
                setAvailableTools(data.tools ?? []);
            })
            .catch(() => {});
    }, [user]);

    useEffect(() => {
        if (!user) return;
        fetch("/api/settings/voice")
            .then((res) => res.json())
            .then((data) => {
                setServerSttEnabled(data.sttEnabled ?? false);
                setServerTtsEnabled(data.ttsEnabled ?? false);
            })
            .catch(() => {});
    }, [user]);

    const selectChat = async (chatId: string) => {
        if (loadingChat) return;
        setSettingsTab(null);
        setShowProjectsView(false);
        if (activeChatId === chatId) return;

        // Already mounted in a hidden window (could still be streaming)? Just show it.
        for (const [mountId, win] of windows) {
            if (win.chatId === chatId) {
                switchMount(mountId, chatId);
                return;
            }
        }

        // Load messages and mount a fresh window
        setLoadingChat(true);
        try {
            const res = await fetch(`/api/chats/${chatId}`);
            if (!res.ok) return;
            const data = await res.json();
            const msgs: ChatMessage[] = (data.messages || []).map((m: any) => {
                let parts: any[] = [{ type: "text", text: m.content }];
                let content = m.content;
                try {
                    const parsed = JSON.parse(m.content);
                    if (parsed && typeof parsed === "object" && "text" in parsed) {
                        content = parsed.text ?? "";
                        parts = [
                            { type: "text", text: content },
                            ...(parsed.files ?? []).map((url: string) => ({ type: "file", mediaType: "image/jpeg", url })),
                        ];
                    }
                } catch { /* plain text */ }
                return { id: m.id, role: m.role, content, parts, replyCount: m._count?.replies ?? 0, reactions: m.reactions ?? [], pinned: m.pinned ?? false, authorId: m.authorId ?? null, authorName: m.authorName ?? null, authorImage: m.authorImage ?? null };
            });

            const mountId = `m${++mountCounter.current}`;
            setWindows(prev => new Map(prev).set(mountId, { chatId, initialMessages: msgs, initialSummary: data.summary ?? null, initialPersonaId: data.activePersonaId ?? null, isCollaborative: data.isCollaborative ?? false, participants: data.participants ?? [] }));
            switchMount(mountId, chatId);
        } catch { /* ignore */ }
        finally { setLoadingChat(false); }
    };

    const startNewChat = () => {
        setSettingsTab(null);
        setShowProjectsView(false);
        // If already on a fresh new-chat window, do nothing
        const cur = windows.get(activeMountRef.current);
        if (cur?.chatId === null) return;

        // Create a fresh window, clean up any idle new-chat windows
        const mountId = `m${++mountCounter.current}`;
        setWindows(prev => {
            const next = new Map(prev);
            for (const [key, win] of next) {
                if (win.chatId === null && !streamingMounts.current.has(key)) next.delete(key);
            }
            next.set(mountId, { chatId: null, initialMessages: [] });
            return next;
        });
        switchMount(mountId, null);
    };

    const startIncognitoChat = () => {
        setSettingsTab(null);
        setShowProjectsView(false);
        // If already on a fresh incognito window, do nothing
        const cur = windows.get(activeMountRef.current);
        if (cur?.chatId === null && cur?.incognito) return;

        // Create a fresh incognito window, clean up any idle new-chat windows
        const mountId = `m${++mountCounter.current}`;
        setWindows(prev => {
            const next = new Map(prev);
            for (const [key, win] of next) {
                if (win.chatId === null && !streamingMounts.current.has(key)) next.delete(key);
            }
            next.set(mountId, { chatId: null, initialMessages: [], incognito: true });
            return next;
        });
        switchMount(mountId, null);
    };

    // Called by ChatWindow when the first message creates a new chat
    const handleChatCreated = (mountId: string) => (chatId: string) => {
        setWindows(prev => {
            const next = new Map(prev);
            const win = next.get(mountId);
            if (win) next.set(mountId, { ...win, chatId });
            return next;
        });
        setActiveChatId(chatId);
        loadChats();
    };

    // Called by ChatWindow when streaming starts or stops
    const handleStreamingChange = (mountId: string) => (isStreaming: boolean) => {
        if (isStreaming) {
            streamingMounts.current.add(mountId);
        } else {
            streamingMounts.current.delete(mountId);
            // Unmount hidden windows once they finish streaming (response is in DB)
            if (mountId !== activeMountRef.current) {
                setWindows(prev => {
                    const next = new Map(prev);
                    next.delete(mountId);
                    return next;
                });
                loadChats(); // refresh sidebar (auto-renamed title, etc.)
            }
        }
    };

    const pinChat = async (chatId: string, pinned: boolean) => {
        try {
            const res = await fetch(`/api/chats/${chatId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pinned }),
            });
            if (!res.ok) return;
        } catch { return; }
        setChatList(prev => prev.map(c => c.id === chatId ? { ...c, pinned } : c));
    };

    const archiveChat = async (chatId: string, archived: boolean) => {
        try {
            const res = await fetch(`/api/chats/${chatId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ archived }),
            });
            if (!res.ok) return;
        } catch { return; }
        setChatList(prev => prev.map(c => c.id === chatId ? { ...c, archived, ...(archived ? { pinned: false } : {}) } : c));
    };

    const renameChat = async (chatId: string, title: string) => {
        try {
            const res = await fetch(`/api/chats/${chatId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title }),
            });
            if (!res.ok) return;
        } catch { return; }
        setChatList(prev => prev.map(c => c.id === chatId ? { ...c, title } : c));
    };

    // Live title update pushed over SSE (a collaborator's first message auto-titled the chat).
    const handleTitleChange = useCallback((chatId: string, title: string) => {
        setChatList(prev => prev.map(c => c.id === chatId ? { ...c, title } : c));
        setWorkspaces(prev => prev.map(ws => ({
            ...ws,
            folders: ws.folders.map(f => ({
                ...f,
                chats: f.chats.map(c => c.id === chatId ? { ...c, title } : c),
            })),
        })));
    }, []);

    const deleteChat = async (chatId: string) => {
        try {
            const res = await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
            if (!res.ok) return;
        } catch { return; }
        const wasActive = activeChatId === chatId;
        const deleted = chatList.find(c => c.id === chatId);
        setChatList(prev => prev.filter(c => c.id !== chatId));
        if (deleted) {
            setTrashList(prev => [{ ...deleted, deletedAt: new Date().toISOString() }, ...prev]);
        }
        setWindows(prev => {
            const next = new Map(prev);
            for (const [mountId, win] of next) {
                if (win.chatId === chatId) next.delete(mountId);
            }
            return next;
        });
        if (wasActive) {
            const mountId = `m${++mountCounter.current}`;
            setWindows(prev => new Map(prev).set(mountId, { chatId: null, initialMessages: [] }));
            switchMount(mountId, null);
        }
    };

    const restoreChat = async (chatId: string) => {
        try {
            const res = await fetch(`/api/chats/${chatId}/restore`, { method: "POST" });
            if (!res.ok) return;
        } catch { return; }
        setTrashList(prev => prev.filter(c => c.id !== chatId));
        await loadChats();
    };

    const permanentDeleteChat = async (chatId: string) => {
        try {
            const res = await fetch(`/api/chats/${chatId}?permanent=true`, { method: "DELETE" });
            if (!res.ok) return;
        } catch { return; }
        setTrashList(prev => prev.filter(c => c.id !== chatId));
    };

    const changeChatFolder = async (chatId: string, folder: string | null) => {
        try {
            const res = await fetch(`/api/chats/${chatId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folder }),
            });
            if (!res.ok) return;
        } catch { return; }
        setChatList(prev => prev.map(c => c.id === chatId ? { ...c, folder } : c));
    };

    const createWorkspaceChat = async (workspaceId: string, folderId: string) => {
        try {
            const res = await fetch(`/api/workspaces/${workspaceId}/folders/${folderId}/chats`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "New Chat" }),
            });
            if (!res.ok) return;
            const data = await res.json();
            await loadWorkspaces();
            await selectChat(data.id);
        } catch { /* ignore */ }
    };

    const handleForkChat = async (newChatId: string) => {
        await loadChats();
        await selectChat(newChatId);
    };

    const toggleShare = async (expiresAt?: string | null) => {
        const chatId = activeChatId;
        if (!chatId) return;
        const activeChat = chatList.find(c => c.id === chatId);
        if (activeChat?.shareToken) {
            await fetch(`/api/chats/${chatId}/share`, { method: "DELETE" }).catch(() => {});
            setChatList(prev => prev.map(c => c.id === chatId ? { ...c, shareToken: null, shareExpiresAt: null, shareViewCount: 0 } : c));
        } else {
            const body = expiresAt ? JSON.stringify({ expiresAt }) : "{}";
            const res = await fetch(`/api/chats/${chatId}/share`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
            }).catch(() => null);
            if (!res?.ok) return;
            const data = await res.json();
            setChatList(prev => prev.map(c => c.id === chatId ? {
                ...c,
                shareToken: data.shareToken,
                shareExpiresAt: data.shareExpiresAt ?? null,
                shareViewCount: 0,
            } : c));
        }
    };

    const revokeAllShares = async () => {
        await fetch("/api/chats/shares/revoke-all", { method: "DELETE" }).catch(() => {});
        setChatList(prev => prev.map(c => ({ ...c, shareToken: null, shareExpiresAt: null, shareViewCount: 0 })));
    };

    const extraCommands = useMemo((): PaletteItem[] => {
        const cmds: PaletteItem[] = [
            {
                id: "toggle-sidebar",
                icon: sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />,
                label: sidebarOpen ? "Hide Sidebar" : "Show Sidebar",
                action: () => { setSidebarOpen(v => !v); setShowCommandPalette(false); },
            },
            {
                id: "new-incognito-chat",
                icon: <Ghost size={15} />,
                label: "New Incognito Chat",
                description: "Start a chat that won't be saved",
                action: () => { startIncognitoChat(); setShowCommandPalette(false); },
            },
            {
                id: "settings-profile",
                icon: <Settings size={15} />,
                label: "Settings: Profile",
                action: () => { setSettingsTab("profile"); setShowCommandPalette(false); },
            },
            {
                id: "settings-appearance",
                icon: <Settings size={15} />,
                label: "Settings: Appearance",
                action: () => { setSettingsTab("appearance"); setShowCommandPalette(false); },
            },
            {
                id: "settings-system-prompt",
                icon: <Settings size={15} />,
                label: "Settings: System Prompt",
                action: () => { setSettingsTab("system-prompt"); setShowCommandPalette(false); },
            },
            {
                id: "settings-memory",
                icon: <Settings size={15} />,
                label: "Settings: Memory",
                action: () => { setSettingsTab("memory"); setShowCommandPalette(false); },
            },
            {
                id: "settings-knowledge",
                icon: <Settings size={15} />,
                label: "Settings: Knowledge",
                action: () => { setSettingsTab("knowledge"); setShowCommandPalette(false); },
            },
            {
                id: "settings-usage",
                icon: <Settings size={15} />,
                label: "Settings: Usage",
                action: () => { setSettingsTab("usage"); setShowCommandPalette(false); },
            },
            {
                id: "view-projects",
                icon: <Building2 size={15} />,
                label: "View Projects",
                action: () => { setShowProjectsView(true); setShowCommandPalette(false); },
            },
            {
                id: "new-project",
                icon: <FolderPlus size={15} />,
                label: "New Project",
                description: "Create a new workspace",
                action: () => { setShowCreateWorkspace(true); setShowCommandPalette(false); },
            },
        ];

        if (activeChatId) {
            const chat = chatList.find(c => c.id === activeChatId);
            if (chat) {
                cmds.push({
                    id: "pin-chat",
                    icon: <Pin size={15} />,
                    label: chat.pinned ? "Unpin Chat" : "Pin Chat",
                    action: () => { pinChat(activeChatId, !chat.pinned); setShowCommandPalette(false); },
                });
                cmds.push({
                    id: "archive-chat",
                    icon: <Archive size={15} />,
                    label: chat.archived ? "Unarchive Chat" : "Archive Chat",
                    action: () => { archiveChat(activeChatId, !chat.archived); setShowCommandPalette(false); },
                });
            }
        }

        return cmds;
    }, [sidebarOpen, activeChatId, chatList]);

    return (
        <>
        <div className="flex h-dvh bg-gray-900 text-white overflow-hidden">

            {/* Mobile backdrop */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar — fixed overlay on mobile, inline on desktop */}
            <div className={`
                fixed lg:relative inset-y-0 left-0 z-40 lg:z-auto
                ${sidebarOpen ? "w-64 translate-x-0" : "w-64 -translate-x-full lg:w-0 lg:translate-x-0"}
                transition-all duration-300 flex flex-col overflow-hidden shrink-0
            `}>
                <ChatSidebar
                    user={user}
                    chatList={chatList}
                    activeChatId={activeChatId}
                    onNewChat={startNewChat}
                    onNewIncognitoChat={startIncognitoChat}
                    onSelectChat={selectChat}
                    onRenameChat={renameChat}
                    onDeleteChat={deleteChat}
                    onFolderChange={changeChatFolder}
                    onPinChat={pinChat}
                    onArchiveChat={archiveChat}
                    onClose={() => setSidebarOpen(false)}
                    onOpenSettings={(tab) => setSettingsTab(tab ?? "profile")}
                    workspaces={workspaces}
                    onNewWorkspaceChat={createWorkspaceChat}
                    onOpenWorkspaceSettings={(id) => setSettingsWorkspaceId(id)}
                    onCreateWorkspace={() => setShowCreateWorkspace(true)}
                    onViewProjects={() => setShowProjectsView(true)}
                    trashList={trashList}
                    onRestoreChat={restoreChat}
                    onPermanentDeleteChat={permanentDeleteChat}
                    appName={appName}
                    subscriptionEnabled={subscriptionEnabled}
                />
            </div>

            {/* Main area */}
            <div className="flex-1 flex relative overflow-hidden">

                {/* Floating controls when sidebar is closed */}
                {!sidebarOpen && (
                    <div className="absolute top-3 left-3 z-20 flex items-center gap-1">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            title="Open sidebar"
                            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                        >
                            <PanelLeftOpen size={18} />
                        </button>
                        <button
                            onClick={startNewChat}
                            title="New chat"
                            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                        >
                            <SquarePen size={18} />
                        </button>
                        <button
                            onClick={startIncognitoChat}
                            title="New incognito chat"
                            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                        >
                            <Ghost size={18} />
                        </button>
                    </div>
                )}

                {/* Notification bell — always visible top-right for authenticated users */}
                {user && (
                    <div className="absolute top-3 right-3 z-20">
                        <NotificationBell userId={user.id} />
                    </div>
                )}

                {/* Projects grid view */}
                {showProjectsView && (
                    <div className="absolute inset-0 flex flex-col overflow-hidden">
                        <ProjectsGrid
                            workspaces={workspaces}
                            onCreateWorkspace={() => setShowCreateWorkspace(true)}
                            onOpenWorkspaceSettings={(id) => setSettingsWorkspaceId(id)}
                        />
                    </div>
                )}

                {/* One ChatWindow per mounted chat — only the active one is visible */}
                {Array.from(windows.entries()).map(([mountId, win]) => {
                    const isActive = mountId === activeMount;
                    const chatData = chatList.find(c => c.id === win.chatId);

                    // Branch navigation data computed from chatList
                    const parentChat = chatData?.parentChatId
                        ? (chatList.find(c => c.id === chatData.parentChatId) ?? null)
                        : null;
                    const childBranches = win.chatId
                        ? chatList.filter(c => c.parentChatId === win.chatId).map(c => ({ id: c.id, title: c.title }))
                        : [];
                    const siblingBranches = chatData?.parentChatId
                        ? chatList.filter(c => c.parentChatId === chatData.parentChatId && c.id !== win.chatId).map(c => ({ id: c.id, title: c.title }))
                        : [];

                    return (
                        <div
                            key={mountId}
                            className={`absolute inset-0 flex flex-col overflow-hidden ${isActive && !showProjectsView ? "" : "invisible pointer-events-none"}`}
                        >
                            <ChatWindow
                                initialChatId={win.chatId}
                                initialMessages={win.initialMessages}
                                initialSummary={win.initialSummary ?? null}
                                onChatCreated={handleChatCreated(mountId)}
                                onMessageSent={() => { loadChats(); loadWorkspaces(); }}
                                onStreamingChange={handleStreamingChange(mountId)}
                                isGuest={!user}
                                chatTitle={chatData?.title}
                                sidebarOpen={sidebarOpen}
                                shareToken={isActive ? (chatData?.shareToken ?? null) : null}
                                shareExpiresAt={isActive ? (chatData?.shareExpiresAt ?? null) : null}
                                shareViewCount={isActive ? (chatData?.shareViewCount ?? 0) : undefined}
                                onShareToggle={isActive ? toggleShare : undefined}
                                onRevokeAllShares={isActive ? revokeAllShares : undefined}
                                allowFileUpload={allowFileUpload}
                                conversationTemplates={conversationTemplates}
                                slashCommands={slashCommands}
                                onForkChat={handleForkChat}
                                allowedModels={allowedModels}
                                multiModelEnabled={multiModelEnabled}
                                knowledgeBases={knowledgeBases}
                                availableTools={availableTools}
                                toolsEnabled={toolsEnabled}
                                serverSttEnabled={serverSttEnabled}
                                serverTtsEnabled={serverTtsEnabled}
                                parentChat={parentChat ? { id: parentChat.id, title: parentChat.title } : null}
                                childBranches={childBranches}
                                siblingBranches={siblingBranches}
                                onNavigateBranch={selectChat}
                                personas={personas}
                                initialPersonaId={win.initialPersonaId ?? null}
                                isCollaborative={win.isCollaborative ?? false}
                                currentUserId={user?.id ?? null}
                                participants={win.participants ?? []}
                                onTitleChange={handleTitleChange}
                                incognito={win.incognito ?? false}
                            />
                        </div>
                    );
                })}

                {loadingChat && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-30">
                        <span className="animate-pulse text-sm text-gray-400">Loading conversation...</span>
                    </div>
                )}
            </div>
        </div>

        {showCreateWorkspace && (
            <CreateWorkspaceModal
                onClose={() => setShowCreateWorkspace(false)}
                onCreated={(ws) => {
                    setShowCreateWorkspace(false);
                    loadWorkspaces();
                    setSettingsWorkspaceId(ws.id);
                }}
            />
        )}

        {settingsTab && <SettingsModal initialTab={settingsTab} onClose={() => setSettingsTab(null)} />}

        {showCommandPalette && (
            <CommandPalette
                chatList={chatList}
                onSelectChat={(chatId) => { selectChat(chatId); setShowCommandPalette(false); }}
                onNewChat={() => { startNewChat(); setShowCommandPalette(false); }}
                onClose={() => setShowCommandPalette(false)}
                extraCommands={extraCommands}
            />
        )}

        {settingsWorkspaceId && user && (
            <WorkspaceSettingsModal
                workspaceId={settingsWorkspaceId}
                currentUserId={user.id}
                baseUrl={typeof window !== "undefined" ? window.location.origin : ""}
                onClose={() => { setSettingsWorkspaceId(null); loadWorkspaces(); }}
                onDeleted={() => { setSettingsWorkspaceId(null); loadWorkspaces(); }}
                onUpdated={(patch) => {
                    setWorkspaces(prev => prev.map(w => w.id === patch.id ? { ...w, ...patch } : w));
                }}
                onFolderCreated={(wsId, folder) => {
                    setWorkspaces(prev => prev.map(w => w.id === wsId
                        ? { ...w, folders: [...w.folders, folder] }
                        : w
                    ));
                }}
                onFolderDeleted={(wsId, folderId) => {
                    setWorkspaces(prev => prev.map(w => w.id === wsId
                        ? { ...w, folders: w.folders.filter(f => f.id !== folderId) }
                        : w
                    ));
                }}
            />
        )}
        </>
    );
}
