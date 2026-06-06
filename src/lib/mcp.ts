/* eslint-disable @typescript-eslint/no-explicit-any */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { dynamicTool, jsonSchema } from "ai";
import { logger } from "@/lib/logger";

/**
 * Model Context Protocol (MCP) integration.
 *
 * Admins register remote MCP servers (Streamable HTTP or SSE transport) in the
 * admin dashboard; their configuration is persisted in the `Setting` table under
 * the `mcpServers` key. At chat time each enabled+requested server is connected,
 * its tools are listed and wrapped as AI SDK `dynamicTool`s, and merged into the
 * agent toolset. Connections are closed once the response stream completes.
 *
 * Only remote transports are supported on purpose — stdio would require spawning
 * arbitrary local processes from the web server, which is a security risk in this
 * deployment model.
 */

export type McpTransport = "http" | "sse";

export interface McpHeader {
    key: string;
    value: string;
}

export interface McpServerConfig {
    id: string;
    name: string;
    description?: string;
    url: string;
    transport: McpTransport;
    /** Optional auth/custom headers (e.g. Authorization: Bearer <token>). */
    headers?: McpHeader[];
    enabled: boolean;
}

/** Picker id used by the chat UI / settings API to reference a whole server. */
export const MCP_TOOL_PREFIX = "mcp:";

const CONNECT_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 30_000;
const MAX_RESULT_CHARS = 20_000;

// ── Config parsing / normalization ────────────────────────────────────────────

function normalizeServer(raw: any): McpServerConfig | null {
    if (!raw || typeof raw !== "object") return null;
    const id = typeof raw.id === "string" ? raw.id : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const url = typeof raw.url === "string" ? raw.url.trim() : "";
    if (!id || !name || !url) return null;
    const transport: McpTransport = raw.transport === "sse" ? "sse" : "http";
    const headers: McpHeader[] = Array.isArray(raw.headers)
        ? raw.headers
              .filter((h: any) => h && typeof h.key === "string" && h.key.trim())
              .map((h: any) => ({ key: String(h.key).trim(), value: String(h.value ?? "") }))
        : [];
    return {
        id,
        name: name.slice(0, 100),
        description: typeof raw.description === "string" ? raw.description.slice(0, 200) : "",
        url: url.slice(0, 500),
        transport,
        headers: headers.length > 0 ? headers : undefined,
        enabled: Boolean(raw.enabled),
    };
}

/** Parse the raw `mcpServers` setting value into a validated config array. */
export function parseMcpServers(raw: string | undefined | null): McpServerConfig[] {
    if (!raw) return [];
    try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr.map(normalizeServer).filter((s): s is McpServerConfig => s !== null);
    } catch {
        return [];
    }
}

// ── Connection ────────────────────────────────────────────────────────────────

function headersToRecord(headers?: McpHeader[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const h of headers ?? []) {
        if (h.key.trim()) out[h.key.trim()] = h.value;
    }
    return out;
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
    ]);
}

async function connectMcpClient(server: McpServerConfig): Promise<Client> {
    const url = new URL(server.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("MCP server URL must use http or https");
    }
    const headers = headersToRecord(server.headers);
    const requestInit = Object.keys(headers).length > 0 ? { headers } : undefined;

    const transport =
        server.transport === "sse"
            ? new SSEClientTransport(url, { requestInit })
            : new StreamableHTTPClientTransport(url, { requestInit });

    const client = new Client(
        { name: "hakerek", version: "1.0.0" },
        { capabilities: {} },
    );
    await withTimeout(
        client.connect(transport),
        CONNECT_TIMEOUT_MS,
        `MCP connection to "${server.name}" timed out`,
    );
    return client;
}

// ── Tool naming + result normalization ─────────────────────────────────────────

function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 24) || "mcp";
}

/** Tool names must match provider constraints: [a-zA-Z0-9_-], max 64 chars. */
function sanitizeToolName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function normalizeToolResult(res: any): Record<string, unknown> {
    const content = Array.isArray(res?.content) ? res.content : [];
    const textParts: string[] = [];
    let hasNonText = false;
    for (const c of content) {
        if (c?.type === "text" && typeof c.text === "string") textParts.push(c.text);
        else hasNonText = true;
    }
    const text = textParts.join("\n").slice(0, MAX_RESULT_CHARS);

    if (res?.isError) {
        return { error: text || "The MCP tool returned an error." };
    }
    if (!text && res?.structuredContent && typeof res.structuredContent === "object") {
        return res.structuredContent as Record<string, unknown>;
    }
    if (!text && hasNonText) {
        return { result: "The tool returned non-text content (e.g. an image or binary) that cannot be shown here." };
    }
    return { result: text };
}

async function callMcpTool(client: Client, name: string, args: unknown): Promise<Record<string, unknown>> {
    try {
        const res = await client.callTool(
            { name, arguments: (args ?? {}) as Record<string, unknown> },
            undefined,
            { timeout: CALL_TIMEOUT_MS },
        );
        return normalizeToolResult(res);
    } catch (err) {
        return { error: `MCP tool "${name}" failed: ${String(err)}` };
    }
}

// ── Public API ──────────────────────────────────────────────────────────────────

export interface McpBuildResult {
    tools: Record<string, any>;
    /** Number of MCP servers that connected successfully. */
    connected: number;
    errors: { server: string; error: string }[];
    /** Closes every open MCP connection. Call once the response stream finishes. */
    close: () => Promise<void>;
}

/**
 * Connect to the given MCP servers, list their tools, and wrap each as an AI SDK
 * dynamic tool. Failures are isolated per-server so one bad server can't break
 * the chat. The caller MUST invoke `close()` after streaming completes.
 */
export async function buildMcpTools(servers: McpServerConfig[]): Promise<McpBuildResult> {
    const tools: Record<string, any> = {};
    const clients: Client[] = [];
    const errors: { server: string; error: string }[] = [];
    const usedNames = new Set<string>();
    let connected = 0;

    await Promise.all(
        servers.map(async (server) => {
            let client: Client | null = null;
            try {
                client = await connectMcpClient(server);
                clients.push(client);
                const { tools: mcpTools } = await client.listTools();
                connected++;
                const slug = slugify(server.name || server.id);
                for (const t of mcpTools) {
                    // Namespace by server slug to avoid collisions across servers.
                    let key = sanitizeToolName(`${slug}_${t.name}`);
                    while (usedNames.has(key)) key = sanitizeToolName(`${key}_x`);
                    usedNames.add(key);
                    const boundClient = client;
                    tools[key] = dynamicTool({
                        description: t.description || `${t.name} (via ${server.name})`,
                        inputSchema: jsonSchema(
                            (t.inputSchema as any) ?? { type: "object", properties: {} },
                        ),
                        execute: async (args: unknown) => callMcpTool(boundClient, t.name, args),
                    });
                }
            } catch (err) {
                errors.push({ server: server.name, error: String(err) });
                logger.warn("mcp_connect_failed", { server: server.name, error: String(err) });
                if (client) await client.close().catch(() => {});
            }
        }),
    );

    return {
        tools,
        connected,
        errors,
        close: async () => {
            await Promise.all(clients.map((c) => c.close().catch(() => {})));
        },
    };
}

/** Connect to a single server and report its tool inventory (admin "Test" button). */
export async function testMcpServer(server: McpServerConfig): Promise<{
    ok: boolean;
    toolCount: number;
    toolNames: string[];
    error?: string;
}> {
    let client: Client | null = null;
    try {
        client = await connectMcpClient(server);
        const { tools } = await client.listTools();
        return {
            ok: true,
            toolCount: tools.length,
            toolNames: tools.map((t) => t.name).slice(0, 50),
        };
    } catch (err) {
        return { ok: false, toolCount: 0, toolNames: [], error: String(err) };
    } finally {
        if (client) await client.close().catch(() => {});
    }
}
