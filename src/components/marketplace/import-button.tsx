"use client";
import { useState } from "react";
import { Download, Check, Loader2 } from "lucide-react";
import { useToast } from "@/components/providers/toast-provider";

interface ImportButtonProps {
    token: string;
    type: "persona" | "slash_command" | "knowledge_base";
    imported?: boolean;
    mine?: boolean;
    signedIn?: boolean;
    /** Where to send anonymous users to sign in (then return). */
    loginCallback?: string;
    className?: string;
}

const TYPE_LABEL: Record<ImportButtonProps["type"], string> = {
    persona: "assistant",
    slash_command: "command",
    knowledge_base: "knowledge base",
};

export function ImportButton({ token, type, imported = false, mine = false, signedIn = true, loginCallback, className }: ImportButtonProps) {
    const { toast } = useToast();
    const [state, setState] = useState<"idle" | "loading" | "done">(imported ? "done" : "idle");

    const base = "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors";

    if (!signedIn) {
        const href = `/login${loginCallback ? `?callbackUrl=${encodeURIComponent(loginCallback)}` : ""}`;
        return (
            <a href={href} className={`${base} bg-blue-600 hover:bg-blue-700 text-white ${className ?? ""}`}>
                <Download size={15} /> Sign in to import
            </a>
        );
    }

    if (mine) {
        return <span className={`${base} bg-gray-800 text-gray-400 border border-gray-700 cursor-default ${className ?? ""}`}>Your item</span>;
    }

    const doImport = async () => {
        setState("loading");
        try {
            const res = await fetch(`/api/marketplace/${token}/import`, { method: "POST" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Import failed");
            }
            setState("done");
            toast(`Imported ${TYPE_LABEL[type]} to your library`, "success");
        } catch (e) {
            setState("idle");
            toast(e instanceof Error ? e.message : "Import failed", "error");
        }
    };

    if (state === "done") {
        return <span className={`${base} bg-emerald-900/30 text-emerald-300 border border-emerald-800 cursor-default ${className ?? ""}`}><Check size={15} /> Imported</span>;
    }

    return (
        <button onClick={doImport} disabled={state === "loading"} className={`${base} bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white ${className ?? ""}`}>
            {state === "loading" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {state === "loading" ? "Importing…" : "Import"}
        </button>
    );
}
