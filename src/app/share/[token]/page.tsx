import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { User, Clock } from "lucide-react";
import { createNotification } from "@/lib/notifications";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;

    const chat = await prisma.chat.findUnique({
        where: { shareToken: token },
        include: {
            messages: { orderBy: { createdAt: "asc" } },
            user: { select: { name: true } },
        },
    });

    if (!chat) notFound();

    if (chat.shareExpiresAt && chat.shareExpiresAt < new Date()) {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4 px-4">
                <Clock size={40} className="text-gray-500" />
                <h1 className="text-xl font-bold text-white">This link has expired</h1>
                <p className="text-sm text-gray-400 text-center">The owner of this shared chat set an expiry date that has passed.</p>
                <Link href="/" className="mt-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                    Go to Hakerek
                </Link>
            </div>
        );
    }

    const updated = await prisma.chat.update({
        where: { shareToken: token },
        data: { shareViewCount: { increment: 1 } },
        select: { userId: true, shareViewCount: true, title: true, id: true },
    });

    // Notify owner — at most once per hour per chat
    createNotification({
        userId: updated.userId,
        type: "shared_chat_viewed",
        title: `"${chat.title}" was viewed`,
        body: `Your shared chat has been viewed ${updated.shareViewCount} time${updated.shareViewCount !== 1 ? "s" : ""}.`,
        link: "/",
        refId: updated.id,
        cooldownSeconds: 3600,
    }).catch(() => {});

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {/* Header */}
            <div className="border-b border-gray-800 px-4 py-3 flex items-center gap-3">
                <img src="/logo.png" alt="Hakerek" className="w-7 h-7 object-contain" />
                <span className="font-semibold text-white">Hakerek</span>
                <span className="text-gray-600 text-sm hidden sm:inline">·</span>
                <span className="text-gray-400 text-sm truncate hidden sm:inline">{chat.title}</span>
                <div className="ml-auto">
                    <Link
                        href="/"
                        className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                        Coba Hakerek
                    </Link>
                </div>
            </div>

            {/* Chat title */}
            <div className="max-w-3xl mx-auto px-4 pt-8 pb-4">
                <h1 className="text-xl font-bold text-white mb-1">{chat.title}</h1>
                <p className="text-sm text-gray-500">
                    Dibagikan oleh {chat.user.name || "pengguna"} · {chat.messages.length} pesan
                    {chat.shareExpiresAt && (
                        <span className="ml-2 text-yellow-600">
                            · Expires {new Date(chat.shareExpiresAt).toLocaleDateString()}
                        </span>
                    )}
                </p>
            </div>

            {/* Messages */}
            <div className="max-w-3xl mx-auto px-4 pb-16 space-y-4">
                {chat.messages.map((m) => {
                    const isUser = m.role === "user";
                    return (
                        <div key={m.id} className={`flex gap-3 w-full ${isUser ? "justify-end" : ""}`}>
                            {!isUser && (
                                <div className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 shrink-0 mt-1 overflow-hidden">
                                    <img src="/logo.png" alt="" className="w-5 h-5 object-contain" />
                                </div>
                            )}
                            <div className={`px-4 py-3 rounded-2xl max-w-[80%] leading-relaxed whitespace-pre-wrap text-sm ${
                                isUser ? "bg-blue-600 text-white rounded-br-sm" : "bg-gray-800 text-gray-100 rounded-bl-sm"
                            }`}>
                                {m.content}
                            </div>
                            {isUser && (
                                <div className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-700 shrink-0 mt-1">
                                    <User size={18} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer CTA */}
            <div className="fixed bottom-0 left-0 right-0 border-t border-gray-800 bg-gray-950/95 backdrop-blur-sm px-4 py-3 text-center">
                <p className="text-sm text-gray-400 mb-2">Ingin percakapan sendiri dengan AI?</p>
                <Link href="/" className="inline-block px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                    Mulai Chat Gratis
                </Link>
            </div>
        </div>
    );
}
