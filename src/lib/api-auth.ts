import { createHash } from "crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AuthUser = { id: string; role: string };

export async function getAuth(req: Request): Promise<AuthUser | null> {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const apiToken = await prisma.apiToken.findUnique({
            where: { tokenHash },
            include: { user: { select: { id: true, role: true, banned: true } } },
        });
        if (!apiToken || apiToken.user.banned) return null;
        prisma.apiToken.update({
            where: { id: apiToken.id },
            data: { lastUsed: new Date() },
        }).catch(() => {});
        return { id: apiToken.user.id, role: apiToken.user.role };
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return null;
    return { id: session.user.id, role: session.user.role };
}
