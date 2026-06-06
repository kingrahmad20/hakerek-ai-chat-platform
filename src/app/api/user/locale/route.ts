import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidLocale } from "@/i18n/translations";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { locale } = await req.json();
    if (!isValidLocale(locale)) {
        return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
    }

    await prisma.user.update({
        where: { id: session.user.id },
        data: { locale },
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set("locale", locale, {
        httpOnly: false,
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        sameSite: "lax",
    });
    return response;
}
