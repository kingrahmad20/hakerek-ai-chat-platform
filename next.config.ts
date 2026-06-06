import type { NextConfig } from "next";

const CSP_DIRECTIVES_BASE = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com",
    // 'self' enables the same-origin artifact-canvas preview iframe (srcdoc).
    "frame-src 'self' https://challenges.cloudflare.com",
    // PWA: service worker script + web app manifest are same-origin.
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
];

const STRICT_CSP = [...CSP_DIRECTIVES_BASE, "frame-ancestors 'none'"].join("; ");

// Widget page CSP: allow embedding from any origin (frame-ancestors *)
const WIDGET_CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors *",
].join("; ");

const baseSecurityHeaders = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    // Force HTTPS for two years incl. subdomains. Safe behind the TLS-terminating proxy.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
    output: "standalone",
    async headers() {
        return [
            {
                // Apply strict frame-deny headers to all paths; /widget overrides below
                source: "/(.*)",
                headers: [
                    ...baseSecurityHeaders,
                    { key: "Content-Security-Policy", value: STRICT_CSP },
                    { key: "X-Frame-Options", value: "DENY" },
                ],
            },
            {
                // Widget page: allow embedding in external iframes
                // Next.js uses last-matching-rule-wins for duplicate header keys
                source: "/widget",
                headers: [
                    { key: "Content-Security-Policy", value: WIDGET_CSP },
                    { key: "X-Frame-Options", value: "SAMEORIGIN" },
                ],
            },
        ];
    },
};

export default nextConfig;
