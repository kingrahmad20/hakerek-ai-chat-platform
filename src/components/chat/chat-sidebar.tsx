/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useRef, useEffect } from "react";
import {
    SquarePen, Search, MoreHorizontal, Pencil, Trash2,
    Check, X as XIcon, LogOut, Shield, LogIn, Settings, CreditCard,
    PanelLeftClose, ChevronDown, Loader2, MessageSquare, FolderOpen,
    Pin, PinOff, Archive, ArchiveRestore,
    Building2, Download, ChevronRight, Sparkles, Ghost,
    Store, Library,
} from "lucide-react";
import type { SettingsTab } from "@/components/settings/settings-modal";
import { signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { ChatSummary, UserInfo, WorkspaceSummary } from "@/types";
import type { SearchResult } from "@/app/api/search/route";

interface ChatSidebarProps {
    user: UserInfo | null;
    chatList: ChatSummary[];
    activeChatId: string | null;
    onNewChat: () => void;
    onNewIncognitoChat?: () => void;
    onSelectChat: (id: string) => void;
    onRenameChat: (id: string, title: string) => Promise<void>;
    onDeleteChat: (id: string) => Promise<void>;
    onFolderChange: (id: string, folder: string | null) => Promise<void>;
    onPinChat: (id: string, pinned: boolean) => Promise<void>;
    onArchiveChat: (id: string, archived: boolean) => Promise<void>;
    onClose: () => void;
    onOpenSettings?: (tab?: SettingsTab) => void;
    // Workspace props
    workspaces?: WorkspaceSummary[];
    onNewWorkspaceChat?: (workspaceId: string, folderId: string) => Promise<void>;
    onOpenWorkspaceSettings?: (workspaceId: string) => void;
    onCreateWorkspace?: () => void;
    onViewProjects?: () => void;
    // Trash props
    trashList?: ChatSummary[];
    onRestoreChat?: (id: string) => Promise<void>;
    onPermanentDeleteChat?: (id: string) => Promise<void>;
    appName?: string;
    subscriptionEnabled?: boolean;
}


function HighlightText({ text, query }: { text: string; query: string }) {
    if (!query.trim()) return <>{text}</>;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escaped})`, "gi"));
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === query.toLowerCase()
                    ? <mark key={i} className="bg-yellow-400/25 text-yellow-200 rounded-sm not-italic">{part}</mark>
                    : part
            )}
        </>
    );
}

function groupByDate(chats: ChatSummary[]) {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const todayMs = startOfDay(now);
    const groups: { label: string; chats: ChatSummary[] }[] = [
        { label: "Today", chats: [] },
        { label: "Yesterday", chats: [] },
        { label: "Last 7 Days", chats: [] },
        { label: "Last 30 Days", chats: [] },
        { label: "Older", chats: [] },
    ];
    for (const chat of chats) {
        const diffDays = Math.floor((todayMs - startOfDay(new Date(chat.updatedAt))) / 86400000);
        if (diffDays === 0) groups[0].chats.push(chat);
        else if (diffDays === 1) groups[1].chats.push(chat);
        else if (diffDays < 7) groups[2].chats.push(chat);
        else if (diffDays < 30) groups[3].chats.push(chat);
        else groups[4].chats.push(chat);
    }
    return groups.filter((g) => g.chats.length > 0);
}

function UserAvatar({ name, email, image }: { name?: string | null; email?: string | null; image?: string | null }) {
    if (image) return <img src={image} alt="Avatar" className="w-8 h-8 rounded-full object-cover shrink-0" />;
    const initials = name
        ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
        : (email?.[0] ?? "U").toUpperCase();
    return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0 select-none">
            {initials}
        </div>
    );
}

interface ChatItemProps {
    chat: ChatSummary;
    isActive: boolean;
    onSelect: (id: string) => void;
    onRename: (id: string, title: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onFolderChange: (id: string, folder: string | null) => Promise<void>;
    onPin: (id: string, pinned: boolean) => Promise<void>;
    onArchive: (id: string, archived: boolean) => Promise<void>;
    existingFolders: string[];
}

function ChatItem({ chat, isActive, onSelect, onRename, onDelete, onFolderChange, onPin, onArchive, existingFolders }: ChatItemProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuAbove, setMenuAbove] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editTitle, setEditTitle] = useState(chat.title);
    const [folderMode, setFolderMode] = useState(false);
    const [folderInput, setFolderInput] = useState(chat.folder ?? "");
    const [exportMode, setExportMode] = useState(false);
    const [exporting, setExporting] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    const exportChat = async (format: "md" | "json" | "txt") => {
        if (exporting) return;
        setExporting(true);
        try {
            const res = await fetch(`/api/chats/${chat.id}`);
            if (!res.ok) return;
            const data = await res.json();
            const msgs: { id: string; role: string; content: string }[] = (data.messages ?? [])
                .filter((m: any) => m.role !== "system")
                .map((m: any) => {
                    let text = m.content ?? "";
                    try {
                        const p = JSON.parse(text);
                        if (p && typeof p === "object" && "text" in p) text = p.text ?? "";
                    } catch {}
                    return { id: m.id, role: m.role, content: text };
                });

            const title = chat.title || "chat";
            const filename = title.replace(/[^a-z0-9\-_\s]/gi, "").trim() || "chat";
            let content = "";
            let mimeType = "text/plain;charset=utf-8";

            if (format === "md") {
                content = `# ${title}\n\nExported: ${new Date().toLocaleString()}\n\n`;
                content += msgs.map((m) => `${m.role === "user" ? "**User**" : "**Assistant**"}:\n\n${m.content}`).join("\n\n---\n\n");
            } else if (format === "json") {
                content = JSON.stringify({ title, exportedAt: new Date().toISOString(), messageCount: msgs.length, messages: msgs }, null, 2);
                mimeType = "application/json;charset=utf-8";
            } else {
                content = msgs.map((m) => `${m.role === "user" ? "User" : "Assistant"}:\n${m.content}`).join("\n\n");
            }

            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${filename}.${format}`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setExporting(false);
            setMenuOpen(false);
        }
    };

    useEffect(() => { if (!menuOpen) { setFolderMode(false); setExportMode(false); } }, [menuOpen]);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [menuOpen]);

    const openMenu = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            // Estimated menu height: ~200px normal, ~260px folder mode
            setMenuAbove(rect.bottom + 210 > window.innerHeight && rect.top > 210);
        }
        setMenuOpen(v => !v);
    };

    useEffect(() => { if (editMode) inputRef.current?.focus(); }, [editMode]);

    useEffect(() => {
        if (folderMode) {
            setFolderInput(chat.folder ?? "");
            setTimeout(() => folderInputRef.current?.focus(), 50);
        }
    }, [folderMode, chat.folder]);

    const confirmEdit = async () => {
        const trimmed = editTitle.trim();
        if (trimmed && trimmed !== chat.title) await onRename(chat.id, trimmed);
        setEditMode(false);
    };

    const confirmFolder = async (val?: string) => {
        const f = (val !== undefined ? val : folderInput).trim() || null;
        await onFolderChange(chat.id, f || null);
        setMenuOpen(false);
    };

    if (editMode) {
        return (
            <div className="flex items-center gap-1.5 px-2 py-1 mx-1 rounded-lg bg-gray-800/80">
                <input
                    ref={inputRef}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") confirmEdit();
                        if (e.key === "Escape") { setEditTitle(chat.title); setEditMode(false); }
                    }}
                    className="flex-1 min-w-0 bg-transparent text-sm text-white focus:outline-none"
                />
                <button onClick={confirmEdit} className="p-1 text-green-400 hover:text-green-300 shrink-0"><Check size={13} /></button>
                <button onClick={() => { setEditTitle(chat.title); setEditMode(false); }} className="p-1 text-gray-500 hover:text-gray-300 shrink-0"><XIcon size={13} /></button>
            </div>
        );
    }

    return (
        <div className={`group relative flex items-center rounded-lg mx-1 my-0.5 cursor-pointer transition-colors ${
            isActive ? "bg-gray-700/70 text-white" : "hover:bg-gray-800/70 text-gray-300 hover:text-white"
        }`}>
            <button onClick={() => onSelect(chat.id)} className="flex-1 text-left px-3 py-2 pr-8 min-w-0 flex items-center gap-1.5">
                {chat.pinned && <Pin size={10} className="text-blue-400 shrink-0 fill-blue-400" />}
                <span className="text-sm truncate block leading-snug">{chat.title}</span>
            </button>

            <div className="absolute right-0 top-0 bottom-0 flex items-center">
                <div className={`w-10 h-full bg-gradient-to-l to-transparent pointer-events-none ${
                    isActive ? "from-gray-700/70" : "from-gray-950 group-hover:from-gray-800/70"
                }`} />
                <div ref={menuRef} className="absolute right-1">
                    <button
                        ref={triggerRef}
                        onClick={openMenu}
                        className={`p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-gray-700 transition-colors ${
                            menuOpen ? "opacity-100 text-white bg-gray-700" : "opacity-0 group-hover:opacity-100"
                        }`}
                    >
                        <MoreHorizontal size={14} />
                    </button>
                    {menuOpen && (
                        <div className={`absolute right-0 w-52 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden py-1 ${menuAbove ? "bottom-full mb-1" : "top-full mt-1"}`}>
                            {!folderMode && !exportMode ? (
                                <>
                                    <button
                                        onClick={() => { setEditMode(true); setMenuOpen(false); }}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                                    >
                                        <Pencil size={13} /> Rename
                                    </button>
                                    <button
                                        onClick={async () => { await onPin(chat.id, !chat.pinned); setMenuOpen(false); }}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                                    >
                                        {chat.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                                        {chat.pinned ? "Unpin" : "Pin"}
                                    </button>
                                    <button
                                        onClick={async () => { await onArchive(chat.id, !chat.archived); setMenuOpen(false); }}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                                    >
                                        {chat.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                                        {chat.archived ? "Unarchive" : "Archive"}
                                    </button>
                                    <button
                                        onClick={() => setFolderMode(true)}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                                    >
                                        <FolderOpen size={13} /> Move to Folder
                                    </button>
                                    <button
                                        onClick={() => setExportMode(true)}
                                        className="flex items-center justify-between w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                                    >
                                        <span className="flex items-center gap-2.5"><Download size={13} /> Export</span>
                                        <ChevronRight size={11} className="text-gray-500" />
                                    </button>
                                    <div className="h-px bg-gray-700 mx-2 my-1" />
                                    <button
                                        onClick={() => { onDelete(chat.id); setMenuOpen(false); }}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors"
                                    >
                                        <Trash2 size={13} /> Delete
                                    </button>
                                </>
                            ) : exportMode ? (
                                <>
                                    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-700">
                                        <button onClick={() => setExportMode(false)} className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors">
                                            <ChevronRight size={13} className="rotate-180" />
                                        </button>
                                        <span className="text-xs font-medium text-gray-400">Export as…</span>
                                        {exporting && <Loader2 size={12} className="animate-spin text-gray-500 ml-auto" />}
                                    </div>
                                    <button
                                        onClick={() => exportChat("md")}
                                        disabled={exporting}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50"
                                    >
                                        Markdown (.md)
                                    </button>
                                    <button
                                        onClick={() => exportChat("json")}
                                        disabled={exporting}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50"
                                    >
                                        JSON (.json)
                                    </button>
                                    <button
                                        onClick={() => exportChat("txt")}
                                        disabled={exporting}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50"
                                    >
                                        Plain Text (.txt)
                                    </button>
                                </>
                            ) : (
                                <div className="p-3 space-y-2">
                                    <p className="text-xs text-gray-400 font-medium mb-1">Move to Folder</p>
                                    <input
                                        ref={folderInputRef}
                                        value={folderInput}
                                        onChange={(e) => setFolderInput(e.target.value)}
                                        placeholder="Folder name..."
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") confirmFolder();
                                            if (e.key === "Escape") setFolderMode(false);
                                        }}
                                        className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                    {existingFolders.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {existingFolders.map((f) => (
                                                <button key={f} onClick={() => confirmFolder(f)} className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-full transition-colors">{f}</button>
                                            ))}
                                        </div>
                                    )}
                                    {chat.folder && (
                                        <button onClick={() => confirmFolder("")} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">(No Folder)</button>
                                    )}
                                    <div className="flex gap-2 pt-1">
                                        <button onClick={() => setFolderMode(false)} className="flex-1 px-2 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">Cancel</button>
                                        <button onClick={() => confirmFolder()} className="flex-1 px-2 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">Save</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function TrashItem({ chat, onRestore, onPermanentDelete }: {
    chat: ChatSummary;
    onRestore: (id: string) => Promise<void>;
    onPermanentDelete: (id: string) => Promise<void>;
}) {
    const daysLeft = chat.deletedAt
        ? Math.max(0, 30 - Math.floor((Date.now() - new Date(chat.deletedAt).getTime()) / 86400000))
        : 30;
    return (
        <div className="group relative flex items-center rounded-lg mx-1 my-0.5 px-3 py-2 text-gray-500 hover:bg-gray-800/50 transition-colors">
            <div className="flex-1 min-w-0 mr-1">
                <span className="text-sm truncate block">{chat.title}</span>
                <span className="text-xs text-gray-600">{daysLeft}d left</span>
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                    onClick={() => onRestore(chat.id)}
                    title="Restore"
                    className="p-1.5 rounded-md hover:text-green-400 hover:bg-gray-700 transition-colors"
                >
                    <ArchiveRestore size={13} />
                </button>
                <button
                    onClick={() => onPermanentDelete(chat.id)}
                    title="Delete permanently"
                    className="p-1.5 rounded-md hover:text-red-400 hover:bg-gray-700 transition-colors"
                >
                    <Trash2 size={13} />
                </button>
            </div>
        </div>
    );
}

function FolderSection({ folderName, chats, activeChatId, onSelect, onRename, onDelete, onFolderChange, onPin, onArchive, existingFolders }: {
    folderName: string; chats: ChatSummary[]; activeChatId: string | null;
    onSelect: (id: string) => void; onRename: (id: string, title: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>; onFolderChange: (id: string, folder: string | null) => Promise<void>;
    onPin: (id: string, pinned: boolean) => Promise<void>; onArchive: (id: string, archived: boolean) => Promise<void>;
    existingFolders: string[];
}) {
    const [open, setOpen] = useState(true);
    return (
        <div className="mb-1">
            <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors">
                <FolderOpen size={12} className="shrink-0" />
                <span className="flex-1 text-left truncate">{folderName}</span>
                <span className="text-gray-600">{chats.length}</span>
                <ChevronDown size={11} className={`text-gray-600 transition-transform ${open ? "" : "-rotate-90"}`} />
            </button>
            {open && chats.map(chat => (
                <ChatItem key={chat.id} chat={chat} isActive={chat.id === activeChatId}
                    onSelect={onSelect} onRename={onRename} onDelete={onDelete}
                    onFolderChange={onFolderChange} onPin={onPin} onArchive={onArchive}
                    existingFolders={existingFolders} />
            ))}
        </div>
    );
}

export function ChatSidebar({
    user, chatList, activeChatId, onNewChat, onNewIncognitoChat, onSelectChat, onRenameChat, onDeleteChat,
    onFolderChange, onPinChat, onArchiveChat, onClose, onOpenSettings,
    workspaces = [], onCreateWorkspace, onViewProjects,
    trashList = [], onRestoreChat, onPermanentDeleteChat,
    appName = "Hakerek",
    subscriptionEnabled = false,
}: ChatSidebarProps) {
    const [search, setSearch] = useState("");
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [semanticMode, setSemanticMode] = useState(false);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [activeSection, setActiveSection] = useState<"chats" | "search" | "workspaces">("chats");
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [showArchive, setShowArchive] = useState(false);
    const [showTrash, setShowTrash] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!userMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [userMenuOpen]);

    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        const q = search.trim();
        if (!q || !user) { setSearchResults([]); setSearching(false); return; }
        setSearching(true);
        searchTimerRef.current = setTimeout(async () => {
            try {
                const url = `/api/search?q=${encodeURIComponent(q)}${semanticMode ? "&mode=semantic" : ""}`;
                const res = await fetch(url);
                const data = await res.json();
                setSearchResults(Array.isArray(data) ? data : []);
            } catch { setSearchResults([]); }
            finally { setSearching(false); }
        }, 300);
        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [search, user, semanticMode]);

    // Partition chats
    const pinned = chatList.filter(c => c.pinned && !c.archived);
    const archived = chatList.filter(c => c.archived);
    const active = chatList.filter(c => !c.pinned && !c.archived);

    // Folders from active chats only
    const folderMap = new Map<string, ChatSummary[]>();
    const ungrouped: ChatSummary[] = [];
    for (const chat of active) {
        if (chat.folder) {
            if (!folderMap.has(chat.folder)) folderMap.set(chat.folder, []);
            folderMap.get(chat.folder)!.push(chat);
        } else {
            ungrouped.push(chat);
        }
    }
    const existingFolders = Array.from(folderMap.keys()).sort();
    const groups = groupByDate(ungrouped);

    const commonItemProps = {
        onSelect: onSelectChat,
        onRename: onRenameChat,
        onDelete: onDeleteChat,
        onFolderChange,
        onPin: onPinChat,
        onArchive: onArchiveChat,
        existingFolders,
    };

    return (
        <div className="flex flex-col h-full bg-gray-950 text-white select-none">

            {/* Header */}
            <div className="flex items-center justify-between px-3 pt-4 pb-2 shrink-0">
                <span className="text-[15px] font-semibold text-white tracking-tight">{appName}</span>
                <div className="flex items-center gap-0.5">
                    <button onClick={onNewChat} title="New chat" className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
                        <SquarePen size={16} />
                    </button>
                    {onNewIncognitoChat && (
                        <button onClick={onNewIncognitoChat} title="New incognito chat" className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
                            <Ghost size={16} />
                        </button>
                    )}
                    <button onClick={onClose} title="Close sidebar" className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
                        <PanelLeftClose size={16} />
                    </button>
                </div>
            </div>

            {/* Navigation items */}
            <nav className="px-2 pb-1 shrink-0 space-y-0.5">
                <button
                    onClick={onNewChat}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800/70 hover:text-white transition-colors"
                >
                    <SquarePen size={15} className="shrink-0" />
                    New chat
                </button>
                {onNewIncognitoChat && (
                    <button
                        onClick={onNewIncognitoChat}
                        title="Chats won't be saved to history"
                        className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800/70 hover:text-gray-200 transition-colors"
                    >
                        <Ghost size={15} className="shrink-0" />
                        Incognito chat
                    </button>
                )}
                <button
                    onClick={() => {
                        if (activeSection === "search") { setActiveSection("chats"); setSearch(""); }
                        else setActiveSection("search");
                    }}
                    className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${activeSection === "search" ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/70 hover:text-gray-200"}`}
                >
                    <Search size={15} className="shrink-0" />
                    Search
                </button>
                <button
                    onClick={() => setActiveSection("chats")}
                    className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${activeSection === "chats" ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/70 hover:text-gray-200"}`}
                >
                    <MessageSquare size={15} className="shrink-0" />
                    Chats
                </button>
                {user && (workspaces.length > 0 || !!onCreateWorkspace) && (
                    <button
                        onClick={() => { setActiveSection("workspaces"); onViewProjects?.(); }}
                        className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${activeSection === "workspaces" ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/70 hover:text-gray-200"}`}
                    >
                        <Building2 size={15} className="shrink-0" />
                        Projects
                    </button>
                )}
            </nav>

            <div className="h-px bg-gray-800/60 mx-3 mb-2 shrink-0" />

            {/* Search input (visible when search section is active) */}
            {activeSection === "search" && (
                <div className="px-2 pb-2 shrink-0 space-y-1.5">
                    <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={semanticMode ? "Describe what you're looking for..." : "Search conversations..."}
                            autoFocus
                            className="w-full pl-8 pr-8 py-2 text-sm bg-gray-800/60 hover:bg-gray-800 focus:bg-gray-800 border border-transparent focus:border-gray-600 rounded-lg focus:outline-none text-gray-300 placeholder-gray-600 transition-colors"
                        />
                        {search && (
                            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 p-0.5">
                                <XIcon size={13} />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => { setSemanticMode((v) => !v); setSearchResults([]); }}
                        title={semanticMode ? "Switch to keyword search" : "Switch to semantic (AI) search"}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors w-full ${semanticMode ? "bg-violet-600/20 text-violet-300 hover:bg-violet-600/30" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"}`}
                    >
                        <Sparkles size={11} />
                        {semanticMode ? "Semantic search on" : "Semantic search"}
                    </button>
                </div>
            )}

            {/* Content area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden pb-2 scrollbar-thin">
                {activeSection === "search" ? (
                    !user ? (
                        <div className="px-3 py-8 text-center">
                            <p className="text-xs text-gray-500 mb-4 leading-relaxed">Log in to search conversation history</p>
                            <a href="/login" className="block w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">Sign In</a>
                        </div>
                    ) : searching ? (
                        <div className="flex items-center justify-center gap-2 mt-8 text-gray-600">
                            <Loader2 size={14} className="animate-spin" />
                            <span className="text-xs">Searching...</span>
                        </div>
                    ) : search.trim() === "" ? (
                        <p className="text-xs text-gray-600 text-center mt-6 px-4">Type to search conversations</p>
                    ) : searchResults.length === 0 ? (
                        <p className="text-xs text-gray-600 text-center mt-6 px-4">No results for &ldquo;{search}&rdquo;</p>
                    ) : (
                        <div className="px-1 py-1">
                            <p className="px-2 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{searchResults.length} results</p>
                            {searchResults.map((result) => (
                                <button
                                    key={`${result.chatId}-${result.matchIn}`}
                                    onClick={() => { onSelectChat(result.chatId); setActiveSection("chats"); setSearch(""); }}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg mx-0 my-0.5 transition-colors hover:bg-gray-800/70 ${result.chatId === activeChatId ? "bg-gray-700/70" : ""}`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1 min-w-0">
                                        {result.matchIn === "message" && <MessageSquare size={10} className="text-gray-500 shrink-0" />}
                                        {result.matchIn === "semantic" && <Sparkles size={10} className="text-violet-400 shrink-0" />}
                                        <span className="text-sm text-gray-200 font-medium truncate">
                                            <HighlightText text={result.chatTitle} query={result.matchIn === "semantic" ? "" : search.trim()} />
                                        </span>
                                    </div>
                                    {(result.matchIn === "message" || result.matchIn === "semantic") && (
                                        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                                            <HighlightText text={result.snippet} query={result.matchIn === "semantic" ? "" : search.trim()} />
                                        </p>
                                    )}
                                </button>
                            ))}
                        </div>
                    )
                ) : activeSection === "workspaces" ? null : (
                    /* Chats section */
                    !user ? (
                        <div className="px-3 py-8 text-center">
                            <p className="text-xs text-gray-500 mb-4 leading-relaxed">Log in to save conversation history</p>
                            <a href="/login" className="block w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors mb-2">Sign In</a>
                            <a href="/login?mode=register" className="block w-full py-2 px-3 border border-gray-700 hover:bg-gray-800 text-gray-300 text-xs font-medium rounded-lg transition-colors">Sign Up Free</a>
                        </div>
                    ) : chatList.length === 0 ? (
                        <p className="text-xs text-gray-600 text-center mt-6 px-4">No conversations yet</p>
                    ) : (
                        <>
                            {/* Pinned */}
                            {pinned.length > 0 && (
                                <div className="mb-2">
                                    <p className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                                        <Pin size={10} className="fill-gray-500" /> Pinned
                                    </p>
                                    {pinned.map(chat => (
                                        <ChatItem key={chat.id} chat={chat} isActive={chat.id === activeChatId} {...commonItemProps} />
                                    ))}
                                </div>
                            )}

                            {/* Folder sections */}
                            {existingFolders.length > 0 && (
                                <div className="mb-2">
                                    {existingFolders.map((folderName) => (
                                        <FolderSection
                                            key={folderName}
                                            folderName={folderName}
                                            chats={folderMap.get(folderName)!}
                                            activeChatId={activeChatId}
                                            {...commonItemProps}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Ungrouped by date */}
                            {groups.map((group) => (
                                <div key={group.label} className="mb-2">
                                    <p className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{group.label}</p>
                                    {group.chats.map((chat) => (
                                        <ChatItem key={chat.id} chat={chat} isActive={chat.id === activeChatId} {...commonItemProps} />
                                    ))}
                                </div>
                            ))}

                            {/* Archived toggle */}
                            {archived.length > 0 && (
                                <div className="mt-1 mb-2">
                                    <button
                                        onClick={() => setShowArchive(v => !v)}
                                        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors"
                                    >
                                        <Archive size={11} className="shrink-0" />
                                        <span className="flex-1 text-left">Archive</span>
                                        <span className="text-gray-600">{archived.length}</span>
                                        <ChevronDown size={11} className={`text-gray-600 transition-transform ${showArchive ? "" : "-rotate-90"}`} />
                                    </button>
                                    {showArchive && archived.map(chat => (
                                        <ChatItem key={chat.id} chat={chat} isActive={chat.id === activeChatId} {...commonItemProps} />
                                    ))}
                                </div>
                            )}

                            {/* Recently Deleted toggle */}
                            {trashList.length > 0 && onRestoreChat && onPermanentDeleteChat && (
                                <div className="mt-1 mb-2">
                                    <button
                                        onClick={() => setShowTrash(v => !v)}
                                        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors"
                                    >
                                        <Trash2 size={11} className="shrink-0" />
                                        <span className="flex-1 text-left">Recently Deleted</span>
                                        <span className="text-gray-600">{trashList.length}</span>
                                        <ChevronDown size={11} className={`text-gray-600 transition-transform ${showTrash ? "" : "-rotate-90"}`} />
                                    </button>
                                    {showTrash && trashList.map(chat => (
                                        <TrashItem
                                            key={chat.id}
                                            chat={chat}
                                            onRestore={onRestoreChat}
                                            onPermanentDelete={onPermanentDeleteChat}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )
                )}
            </div>

            {/* User section */}
            <div className="shrink-0 border-t border-gray-800/60 p-2">
                {user ? (
                    <div ref={userMenuRef} className="relative">
                        {userMenuOpen && (
                            <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden py-1 z-50">
                                {user.role === "ADMIN" && (
                                    <a href="/admin" className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                                        <Shield size={14} /> Admin Dashboard
                                    </a>
                                )}
                                <a href="/marketplace" className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                                    <Store size={14} /> Marketplace
                                </a>
                                <a href="/library" className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                                    <Library size={14} /> My Library
                                </a>
                                {subscriptionEnabled && (
                                    <a href="/subscription" className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                                        <CreditCard size={14} /> Subscription
                                    </a>
                                )}
                                <button
                                    onClick={() => { setUserMenuOpen(false); onOpenSettings?.(); }}
                                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                                >
                                    <Settings size={14} /> Settings
                                </button>
                                <div className="h-px bg-gray-700 mx-2 my-1" />
                                <button
                                    onClick={() => signOut({ callbackUrl: "/" })}
                                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors"
                                >
                                    <LogOut size={14} /> Sign Out
                                </button>
                            </div>
                        )}
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setUserMenuOpen((v) => !v)}
                                className="flex flex-1 items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-800 transition-colors min-w-0"
                            >
                                <UserAvatar name={user.name} email={user.email} image={user.image} />
                                <span className="text-sm text-gray-300 truncate flex-1 text-left">{user.name || user.email}</span>
                                <ChevronDown size={14} className={`text-gray-500 shrink-0 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
                            </button>
                            <ThemeToggle />
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-1">
                        <a href="/login" className="flex flex-1 items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                            <LogIn size={16} /> Sign In / Sign Up
                        </a>
                        <ThemeToggle />
                    </div>
                )}
            </div>
        </div>
    );
}
