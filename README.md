# Hakerek — AI Chat Platform

A web-based AI chat platform built with Next.js 16, supporting multiple AI models via OpenRouter, OpenAI, DeepSeek, Anthropic, Qwen API Key. Includes a full-featured admin dashboard, workspace collaboration, knowledge bases, AI memory, conversation personas, slash commands, an embeddable widget, and automated CI/CD deployment.

## Features

### Chat
- **Multi-window**: AI keeps responding in other chats while you switch between conversations
- Pin, archive, rename, delete, and group chats into folders
- Real-time conversation search (title & message content)
- Share chats via public link with optional expiry and view-count tracking
- Voice input with speech recognition
- File uploads (images and PDFs) embedded inline in messages
- Image generation support
- Fork/branch any conversation to explore alternative paths with a branch switcher UI
- Continue a long conversation in a fresh linked "[Continue]" chat
- AI-generated one-paragraph conversation summaries (cached per chat)
- Truncate chat history at any point
- Message threading — reply to any message in a side thread panel
- Message reactions (👍 👎 ❤️ 😂 🎉 🤔) per-user per-message
- Trash bin with restore and permanent delete
- Action items extraction — auto-extract tasks and decisions from conversations
- Slash command picker — type `/` to insert preconfigured prompt templates
- Conversation templates — start new chats from curated prompts

### AI Personas & Rules
- **Personas** — admin-configurable AI personalities with custom system prompts, selectable per chat
- **AI Rules** — global guidelines injected into every system prompt (admin-configurable, togglable)

### AI Tools
- **Web Search** — query the web via Serper, Brave, or Tavily (admin-configurable)
- **Calculator** — evaluate mathematical expressions
- **Date & Time** — timezone-aware current time
- **URL Fetch** — read and summarize any web page

### AI Memory
- Persistent per-user memory that carries context across conversations
- Categories: Personal, Preference, Goal, Context, General
- Full CRUD — add, edit, and delete memory entries from the chat panel
- Automatic memory extraction and deduplication (cosine similarity, threshold 0.92)

### Knowledge Base
- Create named knowledge bases and attach them to conversations
- Upload documents: PDF, DOCX, DOC, TXT, Markdown, CSV, PPTX
- Real-time processing status (processing → ready / error)
- Documents are chunked, embedded, and queried automatically during chat (RAG)
- Cohere reranking for improved retrieval accuracy

### Workspaces
- Create and manage collaborative workspaces
- Invite members via shareable invite links
- Organize chats into workspace folders
- Manage member roles and permissions (Owner, Admin, Member)

### Notifications
- In-app notification center with unread badge
- Types: workspace invite, shared chat viewed, memory saved, document ready, admin announcement
- Deduplication to avoid repeated alerts

### Subscriptions
- Stripe-powered subscription plans (Free, Pro, Ultra)
- Per-plan message and token limits via the `SubscriptionPlan` model
- Webhook integration for `checkout.session.completed` and `invoice.payment_succeeded`

### Admin Dashboard
- **Dashboard** — live stats: users, chats, messages, token usage, and online users
- **Chats** — view and moderate all user conversations
- **Users** — manage users: ban, promote to admin, delete account, bulk actions
- **Models** — select default and fallback models with drag-and-drop ordering; multi-provider support (OpenRouter, OpenAI, Anthropic, DeepSeek, Qwen)
- **AI Rules** — create rules the AI must obey in every conversation
- **Personas** — create AI personalities with custom system prompts selectable per chat
- **Templates** — manage conversation starter templates
- **Slash Commands** — configure `/command` shortcuts with prompt templates
- **API Keys** — manage multiple OpenRouter API keys with active rotation
- **Widget** — configure and embed a chat widget on any external site
- **Pages** — create and publish public pages (Terms of Service, Privacy Policy, etc.)
- **Settings** — SMTP, email verification, Cloudflare Turnstile, Google OAuth, file uploads
- **Tools** — enable/disable web search providers per deployment
- **Webhooks** — view delivery status, retry failed deliveries, platform-wide webhook management
- **Audit Log** — full administrative action history with actor and metadata
- **Subscription** — manage subscription plans and seed defaults

### Embeddable Widget
- Fully configurable chat widget (title, color, position, bot name, welcome message, system prompt)
- Per-hour rate limiting for anonymous users (configurable)
- One-line embed code to paste into any website
- Streaming response support

### Authentication
- Email/password login and Google OAuth
- Registration with optional email verification and Cloudflare Turnstile CAPTCHA
- Forgot password with email reset link
- Multi-device session management
- Login rate limiting (10 attempts / 15 min per IP)
- Token invalidation via `User.tokenVersion` (revokes all sessions on password change)

### User Profile
- Open profile as an in-app slide-over panel (no page navigation)
- Upload and crop profile photo
- Custom system prompt per user
- Usage stats: chats, messages, tokens, 7-day activity chart
- Change password, revoke all sessions, delete account

### Webhooks & API Access
- Create and manage outbound webhooks with exponential-backoff retry (1m → 5m → 30m → 2h)
- Events: `chat.created`, `chat.updated`, `chat.deleted`, `message.created`
- Test-fire any webhook from the dashboard
- Personal API tokens (SHA-256-hashed, max 10 per user) for programmatic access

### Internationalization
- 7 locale support: English, Bahasa Indonesia, Tetun, Português, हिन्दी, Bahasa Melayu, Tagalog
- Locale stored in both cookie and database
- `useI18n()` hook for all client UI strings; `getT(locale)` for server components

## Tech Stack

| Category | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router, standalone output) |
| Language | TypeScript 5 (strict mode) |
| Database | PostgreSQL 16 + pgvector (dev and prod) |
| ORM | Prisma 5.22 |
| Auth | NextAuth.js v4 — JWT sessions, Credentials + Google OAuth |
| AI | Vercel AI SDK v6, OpenRouter / OpenAI / Anthropic / DeepSeek / Qwen |
| Embeddings & Reranking | OpenRouter + Cohere |
| Web Search | Serper / Brave / Tavily |
| Document Parsing | pdf-parse, Mammoth, pptx2json |
| Styling | Tailwind CSS v4 |
| Payments | Stripe v22 |
| Email | Nodemailer 7 |
| Security | Cloudflare Turnstile, bcryptjs |
| Icons | Lucide React |
| Runtime | Docker + Docker Compose |
| CI/CD | GitHub Actions |

## Project Structure

```
src/
├── app/
│   ├── admin/              # Admin dashboard (server components + server actions)
│   ├── api/
│   │   ├── chat/           # Streaming AI response, tool calls, multimodal
│   │   ├── chats/          # Conversation CRUD + fork, share, truncate, trash, action items
│   │   ├── auth/           # Register, forgot/reset password, API tokens
│   │   ├── user/           # Profile, avatar, password, stats, sessions, locale
│   │   ├── admin/          # SMTP test, analytics, asset uploads, audit log, webhooks
│   │   ├── knowledge/      # Knowledge base + document management (RAG)
│   │   ├── memories/       # AI memory CRUD
│   │   ├── messages/       # Reactions, pins, thread replies
│   │   ├── notifications/  # In-app notification system
│   │   ├── webhooks/       # Webhook management + retry + test
│   │   ├── workspaces/     # Workspace + member + folder management
│   │   ├── subscription/   # Stripe plans, checkout, portal
│   │   ├── stripe/         # Stripe webhook handler
│   │   ├── settings/       # Model and tool settings
│   │   ├── search/         # Full-text conversation search
│   │   ├── generate-image/ # Image generation
│   │   ├── presence/       # Heartbeat / online-user tracking
│   │   ├── maintenance/    # Maintenance mode toggle
│   │   ├── cron/           # Scheduled tasks (webhook retry, rate-limit cleanup)
│   │   └── widget/         # Embeddable widget config + chat
│   ├── login/
│   ├── profile/
│   ├── widget/             # Widget host page (relaxed CSP)
│   ├── workspace/invite/[token]/  # Workspace invite acceptance
│   └── share/[token]/      # Public shared chat page
├── components/
│   ├── admin/              # 16 dashboard tab components
│   ├── chat/               # ChatInterface, ChatSidebar, ChatWindow,
│   │                       #   MessageBubble, MemoryPanel, KnowledgePanel,
│   │                       #   CommandPalette, ActionItemsPanel,
│   │                       #   ThreadPanel, BranchSwitcher, NotificationBell
│   ├── profile/            # ProfileForm, ProfilePanel
│   ├── workspace/          # CreateWorkspaceModal, WorkspaceSettingsModal
│   └── ui/                 # ThemeToggle, Toggle, NoBodyScroll
└── lib/
    ├── auth.ts             # NextAuth config (providers, JWT callbacks, ban/role/tokenVersion checks)
    ├── prisma.ts           # Prisma client singleton
    ├── ai-providers.ts     # Multi-provider AI client factory (OpenRouter/OpenAI/Anthropic/etc.)
    ├── email.ts            # Nodemailer helpers
    ├── memory.ts           # AI memory extraction and deduplication (cosine similarity)
    ├── rag.ts              # RAG pipeline (chunking, embeddings, retrieval, reranking)
    ├── agent-tools.ts      # Web search, calculator, datetime, URL fetch tools
    ├── webhook.ts          # Webhook dispatch and exponential-backoff retry
    ├── notifications.ts    # User notification creation helpers
    ├── rate-limit.ts       # In-database rate limiter (sliding window)
    ├── turnstile.ts        # Cloudflare Turnstile verification
    ├── api-auth.ts         # API token validation (SHA-256 hash lookup)
    ├── ssrf.ts             # SSRF guard (assertSafeUrl / safeFetch) for the URL-fetch tool
    └── logger.ts           # Structured logging
```

## Local Setup

### Prerequisites
- Node.js 20+
- npm
- PostgreSQL 16 with the `pgvector` extension (the schema uses `vector` columns and array fields — SQLite is not supported). The easiest path is the bundled `postgres` service: `docker compose up -d postgres`.

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/kingrahmad20/hakerek.git
cd hakerek

# 2. Install dependencies
npm install

# 3. Create the environment file
cp .env.example .env
# Edit .env — DATABASE_URL (PostgreSQL), NEXTAUTH_SECRET, NEXTAUTH_URL are required

# 4. Enable pgvector, generate the Prisma client, and push the schema
#    (run once against your Postgres database)
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector"
npx prisma generate
npx prisma db push

# 5. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

```env
# Required
DATABASE_URL=postgresql://hakerek:change-me@localhost:5432/hakerek   # PostgreSQL + pgvector
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:3000

# Optional
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
CRON_SECRET=                        # Protects /api/cron/* endpoints
```

OpenRouter API keys and all other runtime config (SMTP, Turnstile, Stripe, web search providers) are managed through the **Admin Dashboard → Settings / API Keys** — not through `.env`.

## Docker Deployment

```bash
# Build and start
docker compose up -d

# Stream logs
docker compose logs -f hakerek-web

# Apply schema changes after deploy
docker compose --profile migrate up db-migrate
```

`docker/entrypoint.sh` automatically runs `prisma db push` before the application starts.

## CI/CD Pipeline

Every push to the `master` branch automatically triggers a production deployment via GitHub Actions.

**Deploy flow:**
1. GitHub Actions SSH into the server
2. `git fetch + reset --hard` — pull the latest code
3. `docker compose build` — build a new image
4. Restart the `hakerek-web` container
5. Reload nginx

**Required GitHub Secrets:**

| Secret | Value |
|---|---|
| `SERVER_HOST` | Production server IP |
| `SERVER_SSH_KEY` | SSH private key for server access |

The server uses a dedicated deploy key (`/root/.ssh/github_deploy`) for pulling from the GitHub repository.

## License

Private project — all rights reserved.
