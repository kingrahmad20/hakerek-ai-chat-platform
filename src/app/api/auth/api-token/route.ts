import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tokens = await prisma.apiToken.findMany({
        where: { userId: session.user.id },
        select: { id: true, name: true, lastUsed: true, createdAt: true },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(tokens);
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { name } = body;
    if (!name?.trim()) {
        return NextResponse.json({ error: "Token name is required" }, { status: 400 });
    }

    const count = await prisma.apiToken.count({ where: { userId: session.user.id } });
    if (count >= 10) {
        return NextResponse.json({ error: "Maximum 10 API tokens allowed" }, { status: 400 });
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const record = await prisma.apiToken.create({
        data: { userId: session.user.id, name: name.trim().slice(0, 60), tokenHash },
        select: { id: true, name: true, createdAt: true },
    });

    // token returned once here — only the hash is persisted
    return NextResponse.json({ ...record, token }, { status: 201 });
}
