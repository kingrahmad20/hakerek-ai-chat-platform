import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Library } from "lucide-react";
import { MarketplaceBrowser } from "@/components/marketplace/marketplace-browser";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/login?callbackUrl=/marketplace");

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="border-b border-gray-800 px-4 py-3 flex items-center gap-3">
                <Link href="/" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
                    <ArrowLeft size={16} /> Chat
                </Link>
                <span className="text-gray-600 text-sm">·</span>
                <span className="font-semibold text-white">Marketplace</span>
                <div className="ml-auto">
                    <Link href="/library" className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors">
                        <Library size={15} /> My Library
                    </Link>
                </div>
            </div>
            <div className="max-w-5xl mx-auto px-4 py-8">
                <MarketplaceBrowser />
            </div>
        </div>
    );
}
