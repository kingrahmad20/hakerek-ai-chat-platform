"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
    theme: Theme;
    toggle: () => void;
    /** Apply a workspace-scoped theme+color override. Pass null to restore the user's personal preference. */
    setWorkspaceOverride: (theme: Theme | null, primaryColor?: string | null) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: "dark",
    toggle: () => {},
    setWorkspaceOverride: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>("dark");

    useEffect(() => {
        const stored = (localStorage.getItem("theme") as Theme | null) || "dark";
        applyTheme(stored);
        setTheme(stored);
    }, []);

    const toggle = () => {
        const next: Theme = theme === "dark" ? "light" : "dark";
        applyTheme(next);
        localStorage.setItem("theme", next);
        setTheme(next);
    };

    const setWorkspaceOverride = useCallback((wsTheme: Theme | null, primaryColor?: string | null) => {
        if (wsTheme) {
            applyTheme(wsTheme);
            setTheme(wsTheme);
        } else {
            // Restore user's personal preference
            const stored = (localStorage.getItem("theme") as Theme | null) || "dark";
            applyTheme(stored);
            setTheme(stored);
        }
        applyPrimaryColor(primaryColor ?? null);
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, toggle, setWorkspaceOverride }}>
            {children}
        </ThemeContext.Provider>
    );
}

function applyTheme(theme: Theme) {
    const html = document.documentElement;
    if (theme === "light") {
        html.classList.remove("dark");
        html.classList.add("light");
    } else {
        html.classList.remove("light");
        html.classList.add("dark");
    }
}

function applyPrimaryColor(color: string | null) {
    document.documentElement.style.setProperty("--ws-primary", color ?? "");
}

export const useTheme = () => useContext(ThemeContext);
