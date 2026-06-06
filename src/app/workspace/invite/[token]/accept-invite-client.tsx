"use client";

import { useState } from "react";
import { Users, Building2, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Props {
    token: string;
    workspaceName: string;
    workspaceDescription?: string | null;
    memberCount: number;
    alreadyMember: boolean;
    workspaceId: string;
}

export function AcceptInviteClient({
    token,
    workspaceName,
    workspaceDescription,
    memberCount,
    alreadyMember,
    workspaceId: _workspaceId,
}: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [joined, setJoined] = useState(alreadyMember);
    const [error, setError] = useState("");

    const handleJoin = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/workspace/accept-invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
            });
            if (!res.ok) {
                const text = await res.text();
                setError(text || "Failed to join workspace");
                return;
            }
            setJoined(true);
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-sm w-full">
            <div className="bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl p-8 text-center space-y-5">
                <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mx-auto">
                    <Building2 size={28} className="text-blue-400" />
                </div>

                <div>
                    <p className="text-sm text-gray-400 mb-1">You&apos;re invited to join</p>
                    <h1 className="text-2xl font-bold">{workspaceName}</h1>
                    {workspaceDescription && (
                        <p className="mt-2 text-sm text-gray-400">{workspaceDescription}</p>
                    )}
                </div>

                <div className="flex items-center justify-center gap-1.5 text-sm text-gray-500">
                    <Users size={14} />
                    <span>{memberCount} {memberCount === 1 ? "member" : "members"}</span>
                </div>

                {error && (
                    <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
                )}

                {joined ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-center gap-2 text-green-400">
                            <CheckCircle size={18} />
                            <span className="text-sm font-medium">
                                {alreadyMember ? "You're already a member!" : "You've joined the workspace!"}
                            </span>
                        </div>
                        <button
                            onClick={() => router.push("/")}
                            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm font-medium transition-colors"
                        >
                            Open Workspace
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={handleJoin}
                        disabled={loading}
                        className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl text-sm font-medium transition-colors"
                    >
                        {loading ? "Joining…" : `Join ${workspaceName}`}
                    </button>
                )}

                <Link href="/" className="block text-xs text-gray-600 hover:text-gray-400 transition-colors">
                    Go to Home
                </Link>
            </div>
        </div>
    );
}
