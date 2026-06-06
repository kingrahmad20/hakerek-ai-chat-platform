import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (
        pathname.startsWith("/maintenance") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/maintenance") ||
        pathname.startsWith("/_next") ||
        pathname === "/login" ||
        pathname === "/favicon.ico" ||
        pathname === "/logo.png"
    ) {
        return NextResponse.next();
    }

    try {
        const setting = await prisma.setting.findUnique({
            where: { key: "maintenanceModeEnabled" },
        });

        if (setting?.value === "true") {
            const token = await getToken({ req: request });
            const isAdmin = token?.role && token.role !== "USER";
            if (!isAdmin) {
                return NextResponse.redirect(new URL("/maintenance", request.url));
            }
        }
    } catch {
        // Fail open: if DB is unreachable, let the request through
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image).*)",
    ],
};
