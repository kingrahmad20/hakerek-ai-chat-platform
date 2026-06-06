"use client";
import { useState, useRef, useEffect } from "react";
import { GitBranch, ChevronUp, ChevronRight, ArrowUpLeft } from "lucide-react";

export interface BranchEntry {
    id: string;
    title: string;
}

interface BranchSwitcherProps {
    currentChatId: string;
    parentChat: BranchEntry | null;
    childBranches: BranchEntry[];
    siblingBranches: BranchEntry[];
    onNavigate: (chatId: string) => void;
}

function truncate(title: string, max = 36) {
    return title.length > max ? title.slice(0, max) + "…" : title;
}

export function BranchSwitcher({
    currentChatId: _currentChatId,
    parentChat,
    childBranches,
    siblingBranches,
    onNavigate,
}: BranchSwitcherProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close on outside click — must be before any early return
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const hasAnyBranches = parentChat || childBranches.length > 0 || siblingBranches.length > 0;
    if (!hasAnyBranches) return null;

    const totalCount = (parentChat ? 1 : 0) + childBranches.length + siblingBranches.length;

    const navigate = (chatId: string) => {
        setOpen(false);
        onNavigate(chatId);
    };

    return (
        <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
            <button
                onClick={() => setOpen((v) => !v)}
                title="Branch switcher"
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors ${
                    open ? "bg-gray-800 text-green-400" : "text-gray-500 hover:text-gray-300"
                }`}
            >
                <GitBranch size={13} />
                <span>Branches</span>
                {totalCount > 0 && (
                    <span className="bg-gray-700 text-gray-300 text-[10px] px-1.5 py-0.5 rounded-full leading-none">
                        {totalCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl w-72 max-w-[calc(100vw-1rem)] z-50 overflow-hidden">
                    <p className="px-3 py-2 text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-700 flex items-center gap-1.5">
                        <GitBranch size={10} /> Branch Navigator
                    </p>

                    {/* Parent */}
                    {parentChat && (
                        <div className="border-b border-gray-700/60">
                            <p className="px-3 pt-2 pb-0.5 text-[10px] text-gray-600 uppercase tracking-wide flex items-center gap-1">
                                <ArrowUpLeft size={9} /> Parent
                            </p>
                            <button
                                onClick={() => navigate(parentChat.id)}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                            >
                                <ChevronUp size={12} className="text-gray-500 shrink-0" />
                                <span className="truncate">{truncate(parentChat.title)}</span>
                            </button>
                        </div>
                    )}

                    {/* Sibling branches */}
                    {siblingBranches.length > 0 && (
                        <div className="border-b border-gray-700/60">
                            <p className="px-3 pt-2 pb-0.5 text-[10px] text-gray-600 uppercase tracking-wide">
                                Other Branches
                            </p>
                            {siblingBranches.map((branch) => (
                                <button
                                    key={branch.id}
                                    onClick={() => navigate(branch.id)}
                                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
                                >
                                    <GitBranch size={11} className="text-gray-600 shrink-0" />
                                    <span className="truncate">{truncate(branch.title)}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Current indicator */}
                    <div className={childBranches.length > 0 ? "border-b border-gray-700/60" : ""}>
                        <p className="px-3 pt-2 pb-0.5 text-[10px] text-gray-600 uppercase tracking-wide">
                            Current
                        </p>
                        <div className="flex items-center gap-2 w-full px-3 py-2 text-sm text-green-400">
                            <GitBranch size={11} className="shrink-0" />
                            <span className="truncate font-medium">
                                {truncate(parentChat
                                    ? "This branch"
                                    : "Main conversation")}
                            </span>
                            <span className="ml-auto text-[10px] text-gray-600 shrink-0">current</span>
                        </div>
                    </div>

                    {/* Child branches (forks from here) */}
                    {childBranches.length > 0 && (
                        <div>
                            <p className="px-3 pt-2 pb-0.5 text-[10px] text-gray-600 uppercase tracking-wide flex items-center gap-1">
                                <ChevronRight size={9} /> Forks from here
                            </p>
                            {childBranches.map((branch) => (
                                <button
                                    key={branch.id}
                                    onClick={() => navigate(branch.id)}
                                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
                                >
                                    <GitBranch size={11} className="text-green-600 shrink-0" />
                                    <span className="truncate">{truncate(branch.title)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
