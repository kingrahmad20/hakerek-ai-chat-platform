"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => { console.error(error); }, [error]);

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 text-white">
            <div className="text-center max-w-md">
                <img src="/logo.png" alt="Hakerek" className="w-20 h-20 object-contain mx-auto mb-6 opacity-60" />
                <h1 className="text-8xl font-black text-gray-700 mb-2">500</h1>
                <h2 className="text-2xl font-semibold text-white mb-3">Terjadi Kesalahan</h2>
                <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                    Sesuatu tidak berjalan dengan benar. Coba lagi atau kembali ke beranda.
                </p>
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
                    >
                        Coba Lagi
                    </button>
                    <Link
                        href="/"
                        className="px-6 py-3 border border-gray-700 hover:bg-gray-800 text-gray-300 text-sm font-medium rounded-xl transition-colors"
                    >
                        Beranda
                    </Link>
                </div>
            </div>
        </div>
    );
}
