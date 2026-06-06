"use client";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
    const { theme, toggle } = useTheme();
    return (
        <button
            onClick={toggle}
            className={className ?? "p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"}
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle theme"
        >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
    );
}
