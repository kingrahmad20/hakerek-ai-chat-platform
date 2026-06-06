import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AcceptInviteClient } from "./accept-invite-client";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function InvitePage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;

    const invite = await prisma.workspaceInvite.findUnique({
        where: { token },
        include: { workspace: { select: { id: true, name: true, description: true, _count: { select: { members: true } } } } },
    });

    if (!invite || !invite.active) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-gray-950 text-white px-4">
                <div className="max-w-sm w-full text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                        <span className="text-3xl">⚠️</span>
                    </div>
                    <h1 className="text-xl font-semibold">Invalid Invite Link</h1>
                    <p className="text-gray-400 text-sm">
                        This invite link is invalid or has been revoked. Ask your team admin for a new link.
                    </p>
                    <Link href="/" className="inline-block mt-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-colors">
                        Go to Home
                    </Link>
                </div>
            </div>
        );
    }

    const session = await getServerSession(authOptions);

    if (!session) {
        // Redirect to login, then come back
        redirect(`/login?callbackUrl=${encodeURIComponent(`/workspace/invite/${token}`)}`);
    }

    // Check if already a member
    const existing = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: session.user.id } },
    });

    return (
        <div className="min-h-dvh flex items-center justify-center bg-gray-950 text-white px-4">
            <AcceptInviteClient
                token={token}
                workspaceName={invite.workspace.name}
                workspaceDescription={invite.workspace.description}
                memberCount={invite.workspace._count.members}
                alreadyMember={!!existing}
                workspaceId={invite.workspaceId}
            />
        </div>
    );
}
