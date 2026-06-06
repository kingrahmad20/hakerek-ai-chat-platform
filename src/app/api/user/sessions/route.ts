import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.user.update({
        where: { id: session.user.id },
        data: { tokenVersion: { increment: 1 } },
    });

    return Response.json({ ok: true });
}
