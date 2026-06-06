import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import SessionWrapper from "@/components/providers/session-provider";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { isValidLocale, DEFAULT_LOCALE, getDir, type Locale } from "@/i18n/translations";
import { prisma } from "@/lib/prisma";

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
    const settings = await prisma.setting.findMany({ where: { key: { in: ["appName", "appDescription"] } } });
    const getSetting = (key: string) => settings.find((s) => s.key === key)?.value || "";
    const appName = getSetting("appName") || "Hakerek";
    return {
        title: appName,
        description: getSetting("appDescription") || "Your intelligent AI assistant for every question.",
        appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: appName },
        icons: {
            icon: "/icons/icon-192.png",
            apple: "/icons/apple-touch-icon.png",
        },
    };
}

export const viewport: Viewport = {
    themeColor: "#0f172a",
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies();
    const raw = cookieStore.get("locale")?.value;
    const locale: Locale = isValidLocale(raw) ? raw : DEFAULT_LOCALE;

    return (
        <html lang={locale} dir={getDir(locale)} className="dark" suppressHydrationWarning>
            <head>
                {/* Prevent flash of wrong theme */}
                <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.className=t==='light'?'light':'dark';}catch(e){}})();` }} />
            </head>
            <body className={inter.className}>
                <ServiceWorkerRegister />
                <I18nProvider initialLocale={locale}>
                    <ThemeProvider>
                        <ToastProvider>
                            <SessionWrapper>{children}</SessionWrapper>
                        </ToastProvider>
                    </ThemeProvider>
                </I18nProvider>
            </body>
        </html>
    );
}
