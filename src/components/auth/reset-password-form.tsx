"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff } from "lucide-react";

export default function ResetPasswordForm({ token }: { token: string }) {
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirm) { setError("Passwords do not match"); return; }
        if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
        setLoading(true);
        setError("");
        const res = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password }),
        });
        const data = await res.json();
        setLoading(false);
        if (!res.ok) {
            setError(data.error);
        } else {
            router.push("/login?reset=1");
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
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold text-white">Create New Password</h2>
                        <p className="text-gray-400 text-sm mt-1">Enter a new password for your account.</p>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {[
                            { label: "New Password", value: password, set: setPassword },
                            { label: "Confirm Password", value: confirm, set: setConfirm },
                        ].map(({ label, value, set }, i) => (
                            <div key={label}>
                                <label className="block text-sm text-gray-400 mb-1">{label}</label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={value}
                                        onChange={(e) => set(e.target.value)}
                                        required
                                        placeholder="At least 8 characters"
                                        className="w-full pl-9 pr-10 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    {i === 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {error && (
                            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
                        >
                            {loading ? "Saving..." : "Save New Password"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
