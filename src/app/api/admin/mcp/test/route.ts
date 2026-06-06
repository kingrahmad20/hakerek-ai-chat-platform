import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { testMcpServer, type McpServerConfig } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Partial<McpServerConfig>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
        return NextResponse.json({ error: "Server URL is required." }, { status: 400 });
    }

    const server: McpServerConfig = {
        id: body.id || "test",
        name: body.name || "test",
        url,
        transport: body.transport === "sse" ? "sse" : "http",
        headers: Array.isArray(body.headers) ? body.headers : undefined,
        enabled: true,
    };

    const result = await testMcpServer(server);
    return NextResponse.json(result);
}
