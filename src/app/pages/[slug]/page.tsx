import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const page = await prisma.page.findUnique({ where: { slug } });
    if (!page || !page.published) return { title: "Page Not Found" };
    return { title: page.title };
}

// Escape HTML so raw markup in page content cannot inject scripts/handlers.
// Must run BEFORE the markdown rules below add their own (trusted) tags.
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function renderMarkdown(text: string): string {
    return escapeHtml(text)
        .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold text-white mt-8 mb-3">$1</h2>')
        .replace(/^### (.+)$/gm, '<h3 class="text-lg font-medium text-white mt-6 mb-2">$1</h3>')
        .replace(/^#### (.+)$/gm, '<h4 class="text-base font-medium text-gray-200 mt-4 mb-1">$1</h4>')
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, '<code class="bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-blue-300">$1</code>')
        .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc list-inside">$1</li>')
        .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal list-inside">$2</li>')
        .replace(/\n{2,}/g, '</p><p class="text-gray-300 leading-relaxed mb-4">')
        .replace(/\n/g, "<br />");
}

export default async function PublicPage({ params }: Props) {
    const { slug } = await params;
    const page = await prisma.page.findUnique({ where: { slug } });

    if (!page || !page.published) notFound();

    const htmlContent = '<p class="text-gray-300 leading-relaxed mb-4">' + renderMarkdown(page.content) + '</p>';

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <div className="max-w-3xl mx-auto px-4 py-12">
                <div className="mb-8">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-6"
                    >
                        <ArrowLeft size={16} /> Back
                    </Link>
                    <h1 className="text-3xl font-bold text-white">{page.title}</h1>
                    <p className="text-gray-500 text-sm mt-2">
                        Last updated: {new Date(page.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                </div>

                <div
                    className="prose prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
            </div>
        </div>
    );
}
