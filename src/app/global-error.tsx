"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => { console.error(error); }, [error]);

    return (
        <html lang="id">
            <body style={{ margin: 0, background: "#030712", color: "#fff", fontFamily: "sans-serif" }}>
                <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
                    <div style={{ textAlign: "center", maxWidth: "400px" }}>
                        <div style={{ fontSize: "6rem", fontWeight: 900, color: "#374151", lineHeight: 1 }}>500</div>
                        <h2 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0.75rem 0" }}>Kesalahan Kritis</h2>
                        <p style={{ color: "#9ca3af", fontSize: "0.875rem", marginBottom: "2rem" }}>
                            Terjadi kesalahan pada aplikasi. Silakan muat ulang halaman.
                        </p>
                        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                            <button
                                onClick={reset}
                                style={{ padding: "0.75rem 1.5rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: "0.75rem", cursor: "pointer", fontSize: "0.875rem", fontWeight: 500 }}
                            >
                                Coba Lagi
                            </button>
                            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                            <a
                                href="/"
                                style={{ padding: "0.75rem 1.5rem", border: "1px solid #374151", color: "#d1d5db", borderRadius: "0.75rem", textDecoration: "none", fontSize: "0.875rem", fontWeight: 500 }}
                            >
                                Beranda
                            </a>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    );
}
