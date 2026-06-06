import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true, image: true, systemPrompt: true, locale: true },
    });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
        id: session.user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        systemPrompt: user.systemPrompt,
        locale: user.locale ?? "en",
    });
}

export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, email } = await req.json();
    if (!name?.trim() || !email?.trim()) {
        return NextResponse.json({ error: "Nama dan email wajib diisi" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return NextResponse.json({ error: "Format email tidak valid" }, { status: 400 });
    }

    if (email.trim() !== session.user.email) {
        const existing = await prisma.user.findUnique({ where: { email: email.trim() } });
        if (existing) return NextResponse.json({ error: "Email sudah digunakan akun lain" }, { status: 409 });
    }

    await prisma.user.update({
        where: { id: session.user.id },
        data: { name: name.trim(), email: email.trim() },
    });

    return NextResponse.json({ ok: true });
}
