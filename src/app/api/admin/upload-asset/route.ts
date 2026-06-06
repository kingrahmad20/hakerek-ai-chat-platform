import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const ALLOWED_LOGO = ["image/png", "image/jpeg", "image/webp"];
const ALLOWED_FAV = ["image/x-icon", "image/vnd.microsoft.icon", "image/png", "image/gif"];
const MAX_SIZE = 2 * 1024 * 1024;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fd = await req.formData();
    const type = fd.get("type") as string;
    const file = fd.get("file") as File | null;

    if (!file || !["logo", "favicon"].includes(type)) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: "File must be under 2MB" }, { status: 400 });
    }

    const allowed = type === "logo" ? ALLOWED_LOGO : ALLOWED_FAV;
    if (!allowed.includes(file.type)) {
        const hint = type === "logo" ? "PNG, JPG, WebP" : "ICO, PNG, GIF";
        return NextResponse.json({ error: `Unsupported format. Use ${hint}` }, { status: 400 });
    }

    const dest =
        type === "logo"
            ? path.join(process.cwd(), "public", "logo.png")
            : path.join(process.cwd(), "src", "app", "favicon.ico");

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(dest, buffer);

    const versionKey = type === "logo" ? "logoVersion" : "faviconVersion";
    const version = Date.now().toString();
    await prisma.setting.upsert({
        where: { key: versionKey },
        update: { value: version },
        create: { key: versionKey, value: version },
    });

    return NextResponse.json({ ok: true, version });
}
