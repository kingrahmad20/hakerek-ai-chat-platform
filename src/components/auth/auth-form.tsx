"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Mail, Lock, User, Eye, EyeOff, CheckCircle, ShieldCheck } from "lucide-react";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useTheme } from "@/components/providers/theme-provider";

interface Props {
    initialMode?: "login" | "register";
    callbackUrl?: string;
    turnstile?: { enabled: boolean; siteKey: string };
    googleEnabled?: boolean;
    ssoEnabled?: boolean;
    ssoName?: string;
    verified?: boolean;
    resetSuccess?: boolean;
    termsSlug?: string;
    privacySlug?: string;
    /** First-run setup: no users exist yet, so the first registration becomes the admin. */
    setup?: boolean;
}

export default function AuthForm({ initialMode = "login", callbackUrl = "/", turnstile, googleEnabled, ssoEnabled, ssoName = "SSO", verified, resetSuccess, termsSlug, privacySlug, setup }: Props) {
    const [mode, setMode] = useState<"login" | "register">(initialMode);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState("");
    const [verificationSent, setVerificationSent] = useState(false);
    const [sentEmail, setSentEmail] = useState("");
    const router = useRouter();
    const { theme } = useTheme();

    const showTurnstile = !!(turnstile?.enabled && turnstile.siteKey);
    const canSubmit = !loading && (!showTurnstile || !!turnstileToken);

    const reset = () => { setError(""); setName(""); setEmail(""); setPassword(""); setTurnstileToken(""); };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        const res = await signIn("credentials", {
            email,
            password,
            turnstileToken: showTurnstile ? turnstileToken : "",
            redirect: false,
        });
        setLoading(false);
        if (res?.error) {
            setError("Incorrect email or password, or account not yet verified.");
            setTurnstileToken("");
        } else {
            router.push(callbackUrl);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
        setLoading(true);
        setError("");
        const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, turnstileToken: showTurnstile ? turnstileToken : "" }),
        });
        const data = await res.json();

        if (!res.ok) {
            setError(data.error);
            setLoading(false);
            setTurnstileToken("");
            return;
        }

        if (data.requiresVerification) {
            setSentEmail(email);
            setVerificationSent(true);
            setLoading(false);
            return;
        }

        if (data.emailFailed) {
            // Email send failed, but registration succeeded — auto-login
            setError("Registration successful, but failed to send verification email. You can log in directly.");
        }

        // Auto-login
        const loginRes = await signIn("credentials", {
            email, password, turnstileToken: "", redirect: false,
        });
        setLoading(false);
        if (loginRes?.error) {
            setMode("login");
            setError("Registration successful. Please log in.");
        } else {
            // The first-ever user is the admin — send them straight to the panel.
            router.push(data.isAdmin ? "/admin" : callbackUrl);
            router.refresh();
        }
    };

    if (verificationSent) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
                <div className="w-full max-w-md text-center">
                    <img src="/logo.png" alt="Hakerek" className="w-24 h-24 object-contain mx-auto block mb-2" />
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-xl">
                        <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Mail size={28} className="text-green-400" />
                        </div>
                        <h2 className="text-xl font-semibold text-white mb-2">Check Your Email</h2>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            A verification email has been sent to <strong className="text-white">{sentEmail}</strong>. Click the link in the email to activate your account.
                        </p>
                        <p className="text-gray-500 text-xs mt-3">Link valid for 24 hours. Check your spam folder if it doesn&apos;t appear.</p>
                        <a href="/login" className="block mt-6 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                            Back to Sign In
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <img src="/logo.png" alt="Hakerek" className="w-24 h-24 object-contain mx-auto block mb-2" />
                    <h1 className="text-3xl font-bold text-white">Hakerek</h1>
                    <p className="text-gray-400 mt-2">{setup ? "Welcome! Create the administrator account to get started." : "AI Chat powered by OpenRouter"}</p>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-xl">
                    {setup && (
                        <div className="flex items-center gap-2 mb-6 px-3 py-2.5 bg-blue-900/20 border border-blue-800 rounded-lg text-sm text-blue-300">
                            <ShieldCheck size={16} />
                            First-time setup — this account will be the admin.
                        </div>
                    )}

                    {(verified || resetSuccess) && (
                        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-green-900/20 border border-green-800 rounded-lg text-sm text-green-400">
                            <CheckCircle size={16} />
                            {verified ? "Email verified! Please log in." : "Password reset. Please log in."}
                        </div>
                    )}

                    {!setup && (
                        <div className="flex gap-1 mb-6 bg-gray-800 rounded-lg p-1">
                            <button
                                onClick={() => { setMode("login"); reset(); }}
                                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${mode === "login" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
                            >
                                Login
                            </button>
                            <button
                                onClick={() => { setMode("register"); reset(); }}
                                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${mode === "register" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
                            >
                                Register
                            </button>
                        </div>
                    )}

                    <form onSubmit={mode === "login" ? handleLogin : handleRegister} className="space-y-4">
                        {mode === "register" && (
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Name</label>
                                <div className="relative">
                                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                        maxLength={80}
                                        placeholder="Full name"
                                        className="w-full pl-9 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            </div>
                        )}

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
                                    className="w-full pl-9 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-sm text-gray-400">Password</label>
                                {mode === "login" && (
                                    <a href="/forgot-password" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                                        Forgot password?
                                    </a>
                                )}
                            </div>
                            <div className="relative">
                                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    maxLength={128}
                                    placeholder={mode === "register" ? "At least 8 characters" : "Password"}
                                    className="w-full pl-9 pr-10 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {showTurnstile && (
                            <TurnstileWidget
                                siteKey={turnstile!.siteKey}
                                onVerify={setTurnstileToken}
                                onExpire={() => setTurnstileToken("")}
                                theme={theme === "dark" ? "dark" : "light"}
                            />
                        )}

                        {showTurnstile && !turnstileToken && (
                            <p className="text-xs text-yellow-400 text-center">Complete Turnstile verification to continue</p>
                        )}

                        {error && (
                            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                        >
                            {loading ? "Processing..." : mode === "login" ? "Sign In" : setup ? "Create Admin Account" : "Register Now"}
                        </button>

                        {mode === "register" && (termsSlug || privacySlug) && (
                            <p className="text-xs text-gray-500 text-center mt-1">
                                By registering, you agree to our{" "}
                                {termsSlug && (
                                    <a href={`/pages/${termsSlug}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                        Terms of Service
                                    </a>
                                )}
                                {termsSlug && privacySlug && " and "}
                                {privacySlug && (
                                    <a href={`/pages/${privacySlug}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                        Privacy Policy
                                    </a>
                                )}
                                .
                            </p>
                        )}
                    </form>

                    {(googleEnabled || ssoEnabled) && (
                        <>
                            <div className="relative my-5">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-700" />
                                </div>
                                <div className="relative flex justify-center text-xs">
                                    <span className="px-3 bg-gray-900 text-gray-500">or</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {googleEnabled && (
                                    <button
                                        type="button"
                                        onClick={() => signIn("google", { callbackUrl })}
                                        className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white hover:bg-gray-100 text-gray-900 font-medium rounded-lg transition-colors"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                                            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                                            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                                            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                                        </svg>
                                        Continue with Google
                                    </button>
                                )}

                                {ssoEnabled && (
                                    <button
                                        type="button"
                                        onClick={() => signIn("oidc", { callbackUrl })}
                                        className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-medium rounded-lg transition-colors"
                                    >
                                        <ShieldCheck size={18} className="text-blue-400" />
                                        Continue with {ssoName}
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
