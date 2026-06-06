import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { canViewItem } from "@/lib/marketplace";
import { notFound } from "next/navigation";
import { Theater, Terminal, Database, Download } from "lucide-react";
import Link from "next/link";
import { ImportButton } from "@/components/marketplace/import-button";
import type { MarketplaceItemType } from "@/types";

export const dynamic = "force-dynamic";

const TYPE_META: Record<MarketplaceItemType, { label: string; icon: React.ReactNode; color: string }> = {
    persona: { label: "Custom Assistant", icon: <Theater size={18} />, color: "text-violet-400" },
    slash_command: { label: "Slash Command", icon: <Terminal size={18} />, color: "text-amber-400" },
    knowledge_base: { label: "Knowledge Base", icon: <Database size={18} />, color: "text-sky-400" },
};

export default async function MarketplaceItemPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const session = await getServerSession(authOptions);

    const item = await prisma.marketplaceItem.findUnique({
        where: { shareToken: token },
        include: { author: { select: { name: true } } },
    });
    if (!item) notFound();

    const allowed = await canViewItem(item, session?.user.id ?? null);
    if (!allowed) notFound();

    await prisma.marketplaceItem.update({ where: { id: item.id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

    const imported = session
        ? !!(await prisma.userLibraryItem.findFirst({ where: { userId: session.user.id, sourceItemId: item.id }, select: { id: true } }))
        : false;

    const type = item.type as MarketplaceItemType;
    const meta = TYPE_META[type];
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(item.payload); } catch { /* ignore */ }

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="border-b border-gray-800 px-4 py-3 flex items-center gap-3">
                <img src="/logo.png" alt="Hakerek" className="w-7 h-7 object-contain" />
                <span className="font-semibold text-white">Hakerek</span>
                <span className="text-gray-600 text-sm hidden sm:inline">·</span>
                <span className="text-gray-400 text-sm hidden sm:inline">Marketplace</span>
                <div className="ml-auto">
                    <Link href="/marketplace" className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors">
                        Browse all
                    </Link>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 py-10">
                <div className={`flex items-center gap-2 text-sm font-medium ${meta.color}`}>
                    {meta.icon} {meta.label}
                </div>
                <h1 className="text-2xl font-bold text-white mt-3">{item.name}</h1>
                {item.description && <p className="text-gray-400 mt-2 leading-relaxed">{item.description}</p>}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 mt-4">
                    <span>by {item.author?.name || "a user"}</span>
                    <span className="flex items-center gap-1"><Download size={13} /> {item.installCount} import{item.installCount === 1 ? "" : "s"}</span>
                    {type === "knowledge_base" && (
                        <span>{Number(payload.documentCount ?? 0)} docs · {Number(payload.chunkCount ?? 0)} chunks</span>
                    )}
                </div>

                {type === "persona" && typeof payload.systemPrompt === "string" && (
                    <div className="mt-6">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">System prompt</p>
                        <pre className="text-sm text-gray-300 bg-gray-900 border border-gray-800 rounded-lg p-3 whitespace-pre-wrap font-sans leading-relaxed max-h-72 overflow-y-auto">{payload.systemPrompt}</pre>
                    </div>
                )}
                {type === "slash_command" && typeof payload.prompt === "string" && (
                    <div className="mt-6">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">/{String(payload.command ?? "")}</p>
                        <pre className="text-sm text-gray-300 bg-gray-900 border border-gray-800 rounded-lg p-3 whitespace-pre-wrap font-sans leading-relaxed max-h-72 overflow-y-auto">{payload.prompt}</pre>
                    </div>
                )}

                <div className="mt-8">
                    <ImportButton
                        token={token}
                        type={type}
                        imported={imported}
                        mine={item.authorId === session?.user.id}
                        signedIn={!!session}
                        loginCallback={`/m/${token}`}
                    />
                </div>
            </div>
        </div>
    );
}
