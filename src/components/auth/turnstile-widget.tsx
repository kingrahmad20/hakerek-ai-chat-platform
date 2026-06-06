"use client";
import { useEffect, useRef } from "react";
import Script from "next/script";

declare global {
    interface Window {
        turnstile?: {
            render(container: HTMLElement, options: {
                sitekey: string;
                callback?: (token: string) => void;
                "expired-callback"?: () => void;
                theme?: "dark" | "light" | "auto";
            }): string;
            reset(widgetId?: string): void;
        };
    }
}

interface Props {
    siteKey: string;
    onVerify: (token: string) => void;
    onExpire: () => void;
    theme?: "dark" | "light" | "auto";
}

export function TurnstileWidget({ siteKey, onVerify, onExpire, theme = "auto" }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);

    const renderWidget = () => {
        if (!containerRef.current || widgetIdRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            callback: onVerify,
            "expired-callback": onExpire,
            theme,
        });
    };

    useEffect(() => {
        if (window.turnstile) renderWidget();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                strategy="lazyOnload"
                onLoad={renderWidget}
            />
            <div ref={containerRef} className="mt-2 flex justify-center" />
        </>
    );
}
