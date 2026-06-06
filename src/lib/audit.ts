import { prisma } from "@/lib/prisma";

/**
 * Write an entry to the admin AuditLog. Best-effort: never throws, so a failed
 * audit write can't break the main action. Mirrors the private helper used by
 * the admin server actions, exposed here for use from API route handlers.
 */
export async function logAudit(
    actorId: string,
    action: string,
    opts?: {
        targetType?: string;
        targetId?: string;
        targetLabel?: string;
        metadata?: Record<string, unknown>;
    },
): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                actorId,
                action,
                targetType: opts?.targetType,
                targetId: opts?.targetId,
                targetLabel: opts?.targetLabel,
                metadata: opts?.metadata ? JSON.stringify(opts.metadata) : undefined,
            },
        });
    } catch {
        // Non-critical — don't fail the caller if the audit write fails.
    }
}
