"use client";
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { translations, LOCALES, LOCALE_NAMES, DEFAULT_LOCALE, isValidLocale, getDir, type Locale } from "@/i18n/translations";

interface I18nContextType {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (path: string) => string;
    LOCALES: typeof LOCALES;
    LOCALE_NAMES: typeof LOCALE_NAMES;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({
    children,
    initialLocale,
}: {
    children: ReactNode;
    initialLocale: Locale;
}) {
    const [locale, setLocaleState] = useState<Locale>(
        isValidLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE
    );

    // Keep <html lang>/<dir> in sync when the locale changes without a full reload.
    useEffect(() => {
        document.documentElement.lang = locale;
        document.documentElement.dir = getDir(locale);
    }, [locale]);

    const t = useCallback(
        (path: string): string => {
            const dict = translations[locale] ?? translations[DEFAULT_LOCALE];
            const keys = path.split(".");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let node: any = dict;
            for (const k of keys) node = node?.[k];
            if (typeof node === "string") return node;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let fallback: any = translations[DEFAULT_LOCALE];
            for (const k of keys) fallback = fallback?.[k];
            return typeof fallback === "string" ? fallback : path;
        },
        [locale]
    );

    const setLocale = useCallback((l: Locale) => {
        setLocaleState(l);
    }, []);

    return (
        <I18nContext.Provider value={{ locale, setLocale, t, LOCALES, LOCALE_NAMES }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useI18n(): I18nContextType {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error("useI18n must be used within I18nProvider");
    return ctx;
}
