"use client";

import { useState, useActionState, useEffect } from "react";
import { Plus, Edit2, Trash2, Globe, EyeOff, X, Check, ExternalLink, FileText } from "lucide-react";
import { useToast } from "@/components/providers/toast-provider";
import { createPage, updatePage, deletePage, togglePagePublished } from "@/app/admin/actions";
import type { PageItem } from "@/app/admin/actions";

interface Props {
    pages: PageItem[];
}

const DEFAULT_PAGES = [
    { slug: "terms-of-service", title: "Terms of Service", content: "## Terms of Service\n\nLast updated: " + new Date().toLocaleDateString() + "\n\nBy using this service, you agree to these terms.\n\n### Acceptance of Terms\n\nBy accessing and using this platform, you accept and agree to be bound by these Terms of Service.\n\n### Use of Service\n\nYou agree to use this service only for lawful purposes and in a manner that does not infringe the rights of others.\n\n### Changes to Terms\n\nWe reserve the right to modify these terms at any time. Continued use of the service constitutes acceptance of the revised terms." },
    { slug: "privacy-policy", title: "Privacy Policy", content: "## Privacy Policy\n\nLast updated: " + new Date().toLocaleDateString() + "\n\nThis Privacy Policy describes how we collect, use, and share information when you use our service.\n\n### Information We Collect\n\nWe collect information you provide directly to us, such as your email address and name when you register.\n\n### How We Use Information\n\nWe use the information we collect to provide, maintain, and improve our services.\n\n### Data Security\n\nWe implement appropriate security measures to protect your personal information.\n\n### Contact Us\n\nIf you have questions about this Privacy Policy, please contact us." },
];

function slugify(val: string) {
    return val.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

export function PagesTab({ pages: initialPages }: Props) {
    const [pages, setPages] = useState<PageItem[]>(initialPages);
    const [view, setView] = useState<"list" | "create" | "edit">("list");
    const [editing, setEditing] = useState<PageItem | null>(null);
    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [content, setContent] = useState("");
    const [published, setPublished] = useState(true);
    const [slugTouched, setSlugTouched] = useState(false);
    const { toast } = useToast();

    const [createState, createAction, createPending] = useActionState(createPage, null);
    const [updateState, updateAction, updatePending] = useActionState(updatePage, null);

    useEffect(() => {
        setPages(initialPages);
    }, [initialPages]);

    useEffect(() => {
        if (!createState) return;
        toast(createState.message, createState.ok ? "success" : "error");
        if (createState.ok) {
            setView("list");
            resetForm();
        }
    }, [createState]);

    useEffect(() => {
        if (!updateState) return;
        toast(updateState.message, updateState.ok ? "success" : "error");
        if (updateState.ok) {
            setView("list");
            setEditing(null);
            resetForm();
        }
    }, [updateState]);

    function resetForm() {
        setTitle(""); setSlug(""); setContent(""); setPublished(true); setSlugTouched(false);
    }

    function openCreate(defaults?: { title: string; content: string; slug: string }) {
        resetForm();
        if (defaults) { setTitle(defaults.title); setSlug(defaults.slug); setContent(defaults.content); }
        setView("create");
    }

    function openEdit(page: PageItem) {
        setEditing(page);
        setTitle(page.title);
        setSlug(page.slug);
        setContent(page.content);
        setPublished(page.published);
        setSlugTouched(true);
        setView("edit");
    }

    function cancel() {
        setView("list");
        setEditing(null);
        resetForm();
    }

    async function handleDelete(id: string, pageTitle: string) {
        if (!confirm(`Delete "${pageTitle}"? This cannot be undone.`)) return;
        const fd = new FormData();
        fd.append("id", id);
        await deletePage(fd);
        setPages((prev) => prev.filter((p) => p.id !== id));
        toast("Page deleted.", "success");
    }

    async function handleToggle(id: string) {
        const fd = new FormData();
        fd.append("id", id);
        await togglePagePublished(fd);
        setPages((prev) => prev.map((p) => p.id === id ? { ...p, published: !p.published } : p));
    }

    const missingDefaults = DEFAULT_PAGES.filter(
        (d) => !pages.some((p) => p.slug === d.slug)
    );

    if (view === "create" || view === "edit") {
        const isEdit = view === "edit";
        const action = isEdit ? updateAction : createAction;
        const pending = isEdit ? updatePending : createPending;

        return (
            <div className="max-w-3xl">
                <div className="flex items-center gap-3 mb-6">
                    <button onClick={cancel} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                    <h2 className="text-lg font-semibold">{isEdit ? `Edit: ${editing?.title}` : "New Page"}</h2>
                </div>

                <form action={action} className="space-y-5">
                    {isEdit && <input type="hidden" name="id" value={editing?.id} />}

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Title</label>
                        <input
                            type="text"
                            name="title"
                            value={title}
                            onChange={(e) => {
                                setTitle(e.target.value);
                                if (!slugTouched) setSlug(slugify(e.target.value));
                            }}
                            required
                            maxLength={200}
                            placeholder="Page title"
                            className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">
                            Slug <span className="text-gray-600 text-xs">(URL path: /pages/slug)</span>
                        </label>
                        <input
                            type="text"
                            name="slug"
                            value={slug}
                            onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
                            required
                            maxLength={100}
                            placeholder="page-slug"
                            className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                        />
                        {slug && (
                            <p className="text-xs text-gray-500 mt-1">/pages/{slugify(slug) || slug}</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">
                            Content <span className="text-gray-600 text-xs">(supports HTML and Markdown)</span>
                        </label>
                        <textarea
                            name="content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={16}
                            placeholder="Page content (supports HTML and Markdown)"
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-y"
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                name="published"
                                checked={published}
                                onChange={(e) => setPublished(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-10 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
                        </label>
                        <span className="text-sm text-gray-300">Published</span>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={pending}
                            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            <Check size={16} />
                            {pending ? "Saving..." : isEdit ? "Save Changes" : "Create Page"}
                        </button>
                        <button type="button" onClick={cancel} className="px-5 py-2.5 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">{pages.length} page{pages.length !== 1 ? "s" : ""}</p>
                <button
                    onClick={() => openCreate()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                    <Plus size={16} /> New Page
                </button>
            </div>

            {missingDefaults.length > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4">
                    <p className="text-sm text-yellow-400 font-medium mb-3">Default pages not created yet</p>
                    <div className="flex flex-wrap gap-2">
                        {missingDefaults.map((d) => (
                            <button
                                key={d.slug}
                                onClick={() => openCreate(d)}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs bg-yellow-800/30 hover:bg-yellow-800/50 text-yellow-300 rounded-lg border border-yellow-700/50 transition-colors"
                            >
                                <Plus size={12} /> Create {d.title}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {pages.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                    <FileText size={40} className="text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">No pages yet.</p>
                    <p className="text-gray-600 text-sm mt-1">Create your first page using the button above.</p>
                </div>
            ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                                <th className="text-left px-5 py-3">Title</th>
                                <th className="text-left px-5 py-3 hidden sm:table-cell">Slug</th>
                                <th className="text-left px-5 py-3 hidden md:table-cell">Updated</th>
                                <th className="text-left px-5 py-3">Status</th>
                                <th className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {pages.map((page) => (
                                <tr key={page.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                                    <td className="px-5 py-3.5 font-medium text-white">{page.title}</td>
                                    <td className="px-5 py-3.5 hidden sm:table-cell">
                                        <span className="font-mono text-xs text-gray-400">/pages/{page.slug}</span>
                                    </td>
                                    <td className="px-5 py-3.5 hidden md:table-cell text-gray-500 text-xs">
                                        {new Date(page.updatedAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <button
                                            onClick={() => handleToggle(page.id)}
                                            title={page.published ? "Published — click to unpublish" : "Draft — click to publish"}
                                            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                                page.published
                                                    ? "bg-green-900/30 border-green-700 text-green-400 hover:bg-green-900/50"
                                                    : "bg-gray-800 border-gray-700 text-gray-500 hover:bg-gray-700"
                                            }`}
                                        >
                                            {page.published ? <><Globe size={11} /> Published</> : <><EyeOff size={11} /> Draft</>}
                                        </button>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center justify-end gap-1">
                                            <a
                                                href={`/pages/${page.slug}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded transition-colors"
                                                title="View page"
                                            >
                                                <ExternalLink size={15} />
                                            </a>
                                            <button
                                                onClick={() => openEdit(page)}
                                                className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors"
                                                title="Edit"
                                            >
                                                <Edit2 size={15} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(page.id, page.title)}
                                                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
