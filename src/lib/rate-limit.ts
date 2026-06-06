import { prisma } from "@/lib/prisma";

export async function rateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);

    return prisma.$transaction(async (tx) => {
        const entry = await tx.rateLimit.findUnique({ where: { key } });

        if (!entry || entry.resetAt < now) {
            await tx.rateLimit.upsert({
                where: { key },
                create: { key, count: 1, resetAt },
                update: { count: 1, resetAt },
            });
            return true;
        }

        if (entry.count >= max) return false;

        await tx.rateLimit.update({
            where: { key },
            data: { count: { increment: 1 } },
        });
        return true;
    });
}
