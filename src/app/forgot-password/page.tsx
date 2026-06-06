"use client";
import { useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        const res = await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });
        const data = await res.json();
        setLoading(false);
        if (!res.ok) {
            setError(data.error);
        } else {
            setSent(true);
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <img src="/logo.png" alt="Hakerek" className="w-24 h-24 object-contain mx-auto block mb-2" />
                    <h1 className="text-3xl font-bold text-white">Hakerek</h1>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-xl">
                    {sent ? (
                        <div className="text-center space-y-4">
                            <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                                <Mail size={28} className="text-green-400" />
                            </div>
                            <h2 className="text-xl font-semibold text-white">Email Sent</h2>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                If an account with <strong className="text-white">{email}</strong> exists, we&apos;ve sent a password reset link. Check your inbox.
                            </p>
                            <p className="text-gray-500 text-xs">Link valid for 1 hour.</p>
                        </div>
                    ) : (
                        <>
                            <div className="mb-6">
                                <h2 className="text-xl font-semibold text-white">Forgot Password</h2>
                                <p className="text-gray-400 text-sm mt-1">Enter your email and we&apos;ll send you a password reset link.</p>
                            </div>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Email</label>
                                    <div className="relative">
                                        <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            placeholder="email@example.com"
                                            className="w-full pl-9 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>
                                {error && (
                                    <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>
                                )}
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
                                >
                                    {loading ? "Sending..." : "Send Reset Link"}
                                </button>
                            </form>
                        </>
                    )}

                    <a href="/login" className="flex items-center justify-center gap-2 mt-6 text-sm text-gray-500 hover:text-gray-300 transition-colors">
                        <ArrowLeft size={14} /> Back to Sign In
                    </a>
                </div>
            </div>
        </div>
    );
}
