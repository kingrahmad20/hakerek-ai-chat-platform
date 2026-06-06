import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { password } = await req.json();
    if (!password) return NextResponse.json({ error: "Password diperlukan" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user?.password) {
        return NextResponse.json({ error: "Tidak dapat memverifikasi identitas" }, { status: 400 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return NextResponse.json({ error: "Password salah" }, { status: 400 });

    // Cascade via Prisma schema deletes chats, messages, sessions, accounts
    await prisma.user.delete({ where: { id: user.id } });

    return NextResponse.json({ ok: true });
}
