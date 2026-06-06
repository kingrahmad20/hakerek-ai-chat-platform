import Link from "next/link";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 text-white">
            <div className="text-center max-w-md">
                <img src="/logo.png" alt="Hakerek" className="w-20 h-20 object-contain mx-auto mb-6 opacity-60" />
                <h1 className="text-8xl font-black text-gray-700 mb-2">404</h1>
                <h2 className="text-2xl font-semibold text-white mb-3">Halaman Tidak Ditemukan</h2>
                <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                    Halaman yang kamu cari tidak ada atau telah dipindahkan.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                    Kembali ke Beranda
                </Link>
            </div>
        </div>
    );
}
