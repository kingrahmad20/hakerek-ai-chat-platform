import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_B64_BYTES = 600_000; // ~450KB decoded, plenty for a 256×256 JPEG
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { image } = await req.json();

    if (!image || typeof image !== "string") {
        return NextResponse.json({ error: "Data gambar tidak valid" }, { status: 400 });
    }

    // Validate data URL format: data:<mime>;base64,<data>
    const match = image.match(/^data:([a-z/]+);base64,/);
    if (!match) {
        return NextResponse.json({ error: "Format gambar tidak valid" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(match[1])) {
        return NextResponse.json({ error: "Tipe file tidak didukung. Gunakan JPEG, PNG, atau WebP." }, { status: 400 });
    }
    if (image.length > MAX_B64_BYTES) {
        return NextResponse.json({ error: "Ukuran gambar terlalu besar (maks 450KB setelah kompresi)" }, { status: 400 });
    }

    await prisma.user.update({
        where: { id: session.user.id },
        data: { image },
    });

    return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await prisma.user.update({
        where: { id: session.user.id },
        data: { image: null },
    });

    return NextResponse.json({ ok: true });
}
