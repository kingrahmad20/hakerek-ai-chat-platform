// ── Platform Roles ────────────────────────────────────────────────────────────

export type PlatformRole = "USER" | "ADMIN" | "user_manager" | "content_moderator" | "billing_admin";

/** Returns true for any role that can access the admin panel. */
export function isAdminRole(role: string): role is Exclude<PlatformRole, "USER"> {
    return role === "ADMIN" || role === "user_manager" || role === "content_moderator" || role === "billing_admin";
}

// ── Workspace / Team ──────────────────────────────────────────────────────────

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";

export interface WorkspaceChatSummary {
    id: string;
    title: string;
    updatedAt: string;
    userId: string;
    _count: { messages: number };
}

export interface WorkspaceFolderSummary {
    id: string;
    name: string;
    chats: WorkspaceChatSummary[];
}

export interface WorkspaceSummary {
    id: string;
    name: string;
    description?: string | null;
    myRole: WorkspaceRole;
    memberCount: number;
    folders: WorkspaceFolderSummary[];
    theme?: string | null;        // "dark" | "light" | null
    primaryColor?: string | null; // hex color or null
}

export interface WorkspaceMemberInfo {
    userId: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: WorkspaceRole;
    joinedAt: string;
}

export interface WorkspaceDetail extends WorkspaceSummary {
    members: WorkspaceMemberInfo[];
    inviteToken?: string | null;
    monthlyBudgetUsd?: number | null; // estimated-spend cap per calendar month; null = no cap
}

// ─────────────────────────────────────────────────────────────────────────────

export interface ChatSummary {
    id: string;
    title: string;
    updatedAt: string;
    folder?: string | null;
    pinned?: boolean;
    archived?: boolean;
    shareToken?: string | null;
    shareExpiresAt?: string | null;
    shareViewCount?: number;
    deletedAt?: string | null;
    parentChatId?: string | null;
    _count: { messages: number };
}

export interface MessageReaction {
    type: string;
    count: number;
    userReacted: boolean;
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content?: string;
    parts?: { type: string; text: string }[];
    parentMessageId?: string | null;
    replyCount?: number;
    reactions?: MessageReaction[];
    pinned?: boolean;
    authorId?: string | null;
    authorName?: string | null;
    authorImage?: string | null;
}

// ── Collaborative Chats (real-time) ─────────────────────────────────────────────

export interface ChatParticipant {
    userId: string;
    name: string | null;
    image: string | null;
    role: WorkspaceRole;
}

export interface ChatViewer {
    userId: string;
    name: string | null;
    image: string | null;
}

export interface MemoryItem {
    id: string;
    content: string;
    category: string;
    sourceId?: string | null;
    createdAt: string;
}

export interface UserInfo {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: PlatformRole;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotificationType =
    | "workspace_member_joined"
    | "shared_chat_viewed"
    | "memory_saved"
    | "document_ready"
    | "admin_announcement"
    | "scheduled_agent"
    | "budget_alert"
    | "marketplace_install";

export interface NotificationItem {
    id: string;
    type: NotificationType;
    title: string;
    body?: string | null;
    link?: string | null;
    read: boolean;
    createdAt: string;
}

// ── Knowledge Base / RAG ──────────────────────────────────────────────────────

export type ConnectorProvider = "gdrive" | "gmail" | "gcal" | "notion";

export interface KnowledgeDocumentSummary {
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    status: "processing" | "ready" | "error";
    errorMessage?: string | null;
    createdAt: string;
    source?: "upload" | ConnectorProvider;
    externalUrl?: string | null;
    _count: { chunks: number };
}

export interface ConnectorSummary {
    id: string;
    provider: ConnectorProvider;
    status: "active" | "error" | "paused";
    accountEmail?: string | null;
    config?: { folderId?: string | null; folderName?: string | null } | null;
    syncIntervalMin: number;
    lastSyncedAt?: string | null;
    lastError?: string | null;
    createdAt: string;
    _count: { documents: number };
}

export interface KnowledgeBaseSummary {
    id: string;
    name: string;
    description?: string | null;
    createdAt: string;
    updatedAt: string;
    documents: KnowledgeDocumentSummary[];
    connectors?: ConnectorSummary[];
}

// ── Marketplace / Library ─────────────────────────────────────────────────────

export type MarketplaceItemType = "persona" | "slash_command" | "knowledge_base";
export type MarketplaceVisibility = "public" | "workspace" | "unlisted";
export type LibraryItemType = "persona" | "slash_command";

/** A published item as shown in the marketplace browser (no payload). */
export interface MarketplaceItemSummary {
    id: string;
    shareToken: string;
    type: MarketplaceItemType;
    visibility: MarketplaceVisibility;
    name: string;
    description?: string | null;
    authorName?: string | null;
    workspaceId?: string | null;
    installCount: number;
    viewCount: number;
    createdAt: string;
    /** True when the current user has already imported this item. */
    imported?: boolean;
    /** True when the current user is the author. */
    mine?: boolean;
}

/** A user-owned persona / slash command from the personal library. */
export interface UserLibraryItemSummary {
    id: string;
    type: LibraryItemType;
    enabled: boolean;
    sourceItemId?: string | null;
    // Parsed persona/slash-command fields live here for convenience.
    name: string;
    description?: string;
    systemPrompt?: string;
    model?: string;
    knowledgeBaseIds?: string[];
    toolIds?: string[];
    command?: string;
    prompt?: string;
    /** shareToken of the marketplace listing if this library item is published. */
    publishedToken?: string | null;
    createdAt: string;
}
