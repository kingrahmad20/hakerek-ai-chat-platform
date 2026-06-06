"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, ChevronRight, Trash2, X, User as UserIcon } from "lucide-react";
import { deleteChat, bulkDeleteChats } from "@/app/admin/actions";

interface UserItem {
    id: string;
    email?: string | null;
    name?: string | null;
    _count: { chats: number };
}

interface ChatItem {
    id: string;
    title: string;
    updatedAt: string;
    user?: { email?: string | null; name?: string | null };
    _count: { messages: number };
}

interface MessageItem {
    id: string;
    role: string;
    content: string;
}

interface ChatDetail {
    title: string;
    userId?: string;
    user?: { email?: string | null; name?: string | null };
    messages: MessageItem[];
}

interface Props {
    users?: UserItem[];
    chats?: ChatItem[];
    detail?: ChatDetail | null;
    detailChatId?: string;
    userId?: string;
    userInfo?: { email?: string | null; name?: string | null } | null;
}

export function ChatsTab({ users, chats, detail, detailChatId, userId, userInfo }: Props) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [isPending, startTransition] = useTransition();

    // ── Conversation detail view ───────────────────────────────────────────
    if (detailChatId && detail) {
        const backHref = detail.userId
            ? `/admin?tab=chats&userId=${detail.userId}`
            : "/admin?tab=chats";
        return (
            <div>
                <div className="flex items-center gap-3 mb-6">
                    <a href={backHref} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
                        <ArrowLeft size={16} /> {detail.user?.name || detail.user?.email || "Conversations"}
                    </a>
                    <ChevronRight size={14} className="text-gray-600" />
                    <span className="text-sm text-gray-300 truncate">{detail.title}</span>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-gray-800">
                        <h2 className="font-semibold">{detail.title}</h2>
                        <p className="text-xs text-gray-500 mt-1">
                            {detail.user?.name || detail.user?.email} &middot; {detail.messages.length} messages
                        </p>
                    </div>
                    <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                        {detail.messages.map((msg) => (
                            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                                <div className={`px-4 py-2.5 rounded-2xl max-w-[75%] text-sm leading-relaxed whitespace-pre-wrap ${
                                    msg.role === "user"
                                        ? "bg-blue-600 text-white rounded-br-sm"
                                        : "bg-gray-800 text-gray-100 rounded-bl-sm"
                                }`}>
                                    {msg.role !== "user" && (
                                        <span className="text-xs text-gray-400 block mb-1 font-medium">AI</span>
                                    )}
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ── User list view (top level) ─────────────────────────────────────────
    if (!userId) {
        const userList = users ?? [];
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-gray-800">
                    <h2 className="font-semibold">Users ({userList.length})</h2>
                    <p className="text-xs text-gray-500 mt-1">Select a user to view their conversations</p>
                </div>
                {!userList.length ? (
                    <p className="p-8 text-center text-gray-500 text-sm">No users with conversations yet</p>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {userList.map((u) => (
                            <a
                                key={u.id}
                                href={`/admin?tab=chats&userId=${u.id}`}
                                className="flex items-center justify-between p-4 group hover:bg-gray-800/50 transition-colors"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center shrink-0 text-gray-400">
                                        <UserIcon size={16} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm truncate group-hover:text-blue-400 transition-colors">
                                            {u.name || u.email || "Unknown user"}
                                        </p>
                                        {u.name && u.email && (
                                            <p className="text-xs text-gray-500 truncate">{u.email}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                    <span className="text-xs text-gray-500">{u._count.chats} conversation{u._count.chats === 1 ? "" : "s"}</span>
                                    <ChevronRight size={16} className="text-gray-600 group-hover:text-gray-400" />
                                </div>
                            </a>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // ── Conversation list for a single user ────────────────────────────────
    const chatList = chats ?? [];
    const allSelected = chatList.length > 0 && chatList.every((c) => selected.has(c.id));
    const userLabel = userInfo?.name || userInfo?.email || "User";

    const toggleAll = () => setSelected(allSelected ? new Set() : new Set(chatList.map((c) => c.id)));

    const toggleOne = (id: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const doBulkDelete = () => {
        const fd = new FormData();
        selected.forEach((id) => fd.append("chatId", id));
        startTransition(async () => {
            await bulkDeleteChats(fd);
            setSelected(new Set());
        });
    };

    const doDeleteOne = (chatId: string) => {
        const fd = new FormData();
        fd.append("chatId", chatId);
        startTransition(() => deleteChat(fd));
    };

    return (
        <div>
            <div className="flex items-center gap-3 mb-6">
                <a href="/admin?tab=chats" className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
                    <ArrowLeft size={16} /> All Users
                </a>
                <ChevronRight size={14} className="text-gray-600" />
                <span className="text-sm text-gray-300 truncate">{userLabel}</span>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-gray-800">
                    <h2 className="font-semibold">{userLabel}&rsquo;s Conversations ({chatList.length})</h2>
                    {userInfo?.name && userInfo?.email && (
                        <p className="text-xs text-gray-500 mt-1">{userInfo.email}</p>
                    )}
                </div>

                {selected.size > 0 && (
                    <div className="px-4 py-2.5 bg-blue-600/10 border-b border-blue-500/20 flex items-center gap-3 flex-wrap">
                        <span className="text-sm text-blue-400 font-medium">{selected.size} selected</span>
                        <div className="flex items-center gap-2 ml-auto">
                            <button
                                onClick={doBulkDelete}
                                disabled={isPending}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                            >
                                <Trash2 size={13} /> Delete Selected
                            </button>
                            <button
                                onClick={() => setSelected(new Set())}
                                className="p-1.5 text-gray-500 hover:text-white transition-colors"
                                aria-label="Clear selection"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                )}

                {!chatList.length ? (
                    <p className="p-8 text-center text-gray-500 text-sm">No conversations yet</p>
                ) : (
                    <>
                        {/* Select-all header row */}
                        <div className="flex items-center px-4 py-2 border-b border-gray-800 bg-gray-900/60">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={toggleAll}
                                className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-blue-500 cursor-pointer mr-3"
                            />
                            <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Select all</span>
                        </div>

                        <div className="divide-y divide-gray-800">
                            {chatList.map((chat) => {
                                const isChecked = selected.has(chat.id);
                                return (
                                    <div
                                        key={chat.id}
                                        className={`flex items-center transition-colors ${isChecked ? "bg-blue-900/10" : "hover:bg-gray-800/50"}`}
                                    >
                                        <div
                                            className="p-4 shrink-0"
                                            onClick={(e) => { e.stopPropagation(); toggleOne(chat.id); }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => toggleOne(chat.id)}
                                                className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-blue-500 cursor-pointer"
                                            />
                                        </div>
                                        <a
                                            href={`/admin?tab=chats&chatId=${chat.id}`}
                                            className="flex-1 flex items-center justify-between py-4 pr-4 group min-w-0"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm truncate group-hover:text-blue-400 transition-colors">{chat.title}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {chat._count.messages} messages &middot; {new Date(chat.updatedAt).toLocaleDateString("en-US")}
                                                </p>
                                            </div>
                                            <ChevronRight size={16} className="text-gray-600 group-hover:text-gray-400 shrink-0 ml-2" />
                                        </a>
                                        <button
                                            onClick={() => doDeleteOne(chat.id)}
                                            disabled={isPending}
                                            className="p-4 text-gray-600 hover:text-red-400 disabled:opacity-50 transition-colors shrink-0"
                                            aria-label="Delete chat"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
