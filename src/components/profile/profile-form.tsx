"use client";
import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import { User, Lock, Trash2, ArrowLeft, MessageSquare, Camera, X, BarChart2, ShieldAlert, Globe } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useI18n } from "@/components/providers/i18n-provider";
import { type Locale } from "@/i18n/translations";
import Link from "next/link";

interface Props {
    user: {
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
        systemPrompt: string | null;
        locale: Locale;
    };
    onClose?: () => void;
}

type Feedback = { type: "ok" | "err"; text: string } | null;

function Alert({ fb }: { fb: Feedback }) {
    if (!fb) return null;
    return (
        <p className={`text-sm px-3 py-2 rounded-lg border ${fb.type === "ok" ? "text-green-400 bg-green-900/20 border-green-800" : "text-red-400 bg-red-900/20 border-red-800"}`}>
            {fb.text}
        </p>
    );
}

function resizeToSquare(file: File, size: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d")!;
                const min = Math.min(img.width, img.height);
                const sx = (img.width - min) / 2;
                const sy = (img.height - min) / 2;
                ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
                resolve(canvas.toDataURL("image/jpeg", 0.88));
            };
            img.onerror = reject;
            img.src = ev.target!.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function UserAvatarDisplay({ image, name, email }: { image: string | null; name: string | null; email: string | null }) {
    const initials = name
        ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
        : (email?.[0] ?? "U").toUpperCase();
    if (image) {
        return (
            <img
                src={image}
                alt="Avatar"
                className="w-24 h-24 rounded-full object-cover"
            />
        );
    }
    return (
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center font-bold text-white select-none text-3xl">
            {initials}
        </div>
    );
}

function fmtTokens(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(0) + "K";
    return String(n);
}

export default function ProfileForm({ user, onClose }: Props) {
    const { t, locale, setLocale, LOCALES, LOCALE_NAMES } = useI18n();

    // Avatar section
    const [avatarPreview, setAvatarPreview] = useState<string | null>(user.image);
    const [avatarFb, setAvatarFb] = useState<Feedback>(null);
    const [avatarLoading, setAvatarLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Profile section
    const [name, setName] = useState(user.name ?? "");
    const [email, setEmail] = useState(user.email ?? "");
    const [profileFb, setProfileFb] = useState<Feedback>(null);
    const [profileLoading, setProfileLoading] = useState(false);

    // Password section
    const [currentPw, setCurrentPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [pwFb, setPwFb] = useState<Feedback>(null);
    const [pwLoading, setPwLoading] = useState(false);

    // System prompt section
    const [systemPrompt, setSystemPrompt] = useState(user.systemPrompt ?? "");
    const [promptFb, setPromptFb] = useState<Feedback>(null);
    const [promptLoading, setPromptLoading] = useState(false);

    // Language section
    const [selectedLocale, setSelectedLocale] = useState<Locale>(user.locale);
    const [localeFb, setLocaleFb] = useState<Feedback>(null);
    const [localeLoading, setLocaleLoading] = useState(false);

    // Session section
    const [sessionFb, setSessionFb] = useState<Feedback>(null);
    const [sessionLoading, setSessionLoading] = useState(false);

    // Delete section
    const [deletePw, setDeletePw] = useState("");
    const [deleteFb, setDeleteFb] = useState<Feedback>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Stats section
    const [stats, setStats] = useState<{
        totalChats: number;
        totalMessages: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        last7Days: { date: string; label: string; messages: number }[];
        topModels: { model: string; count: number; tokens: number }[];
    } | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);

    useEffect(() => {
        fetch("/api/user/stats")
            .then((r) => r.json())
            .then((d) => setStats(d))
            .catch(() => {})
            .finally(() => setStatsLoading(false));
    }, []);

    const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!allowed.includes(file.type)) {
            setAvatarFb({ type: "err", text: t("profile.photo.unsupportedFormat") });
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setAvatarFb({ type: "err", text: t("profile.photo.tooLarge") });
            return;
        }

        setAvatarLoading(true);
        setAvatarFb(null);

        try {
            const resized = await resizeToSquare(file, 256);
            setAvatarPreview(resized);

            const res = await fetch("/api/user/avatar", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: resized }),
            });
            const data = await res.json();
            setAvatarFb(res.ok
                ? { type: "ok", text: t("profile.photo.updated") }
                : { type: "err", text: data.error }
            );
        } catch {
            setAvatarFb({ type: "err", text: t("profile.photo.processFailed") });
        } finally {
            setAvatarLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleRemoveAvatar = async () => {
        if (!avatarPreview) return;
        setAvatarLoading(true);
        setAvatarFb(null);
        const res = await fetch("/api/user/avatar", { method: "DELETE" });
        if (res.ok) {
            setAvatarPreview(null);
            setAvatarFb({ type: "ok", text: t("profile.photo.removed") });
        } else {
            setAvatarFb({ type: "err", text: t("profile.photo.removeFailed") });
        }
        setAvatarLoading(false);
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setProfileLoading(true);
        setProfileFb(null);
        const res = await fetch("/api/user/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.trim(), email: email.trim() }),
        });
        const data = await res.json();
        setProfileLoading(false);
        setProfileFb(res.ok ? { type: "ok", text: t("profile.info.updated") } : { type: "err", text: data.error });
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPw !== confirmPw) { setPwFb({ type: "err", text: t("profile.password.mismatch") }); return; }
        if (newPw.length < 8) { setPwFb({ type: "err", text: t("profile.password.tooShort") }); return; }
        setPwLoading(true);
        setPwFb(null);
        const res = await fetch("/api/user/password", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
        });
        const data = await res.json();
        setPwLoading(false);
        if (res.ok) {
            setPwFb({ type: "ok", text: t("profile.password.changed") });
            setCurrentPw(""); setNewPw(""); setConfirmPw("");
        } else {
            setPwFb({ type: "err", text: data.error });
        }
    };

    const handleSaveSystemPrompt = async (e: React.FormEvent) => {
        e.preventDefault();
        setPromptLoading(true);
        setPromptFb(null);
        const res = await fetch("/api/user/system-prompt", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ systemPrompt }),
        });
        const data = await res.json();
        setPromptLoading(false);
        setPromptFb(res.ok ? { type: "ok", text: t("profile.systemPrompt.saved") } : { type: "err", text: data.error });
    };

    const handleSaveLocale = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocaleLoading(true);
        setLocaleFb(null);
        const res = await fetch("/api/user/locale", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locale: selectedLocale }),
        });
        const data = await res.json();
        setLocaleLoading(false);
        if (res.ok) {
            setLocale(selectedLocale);
            setLocaleFb({ type: "ok", text: t("profile.language.saved") });
        } else {
            setLocaleFb({ type: "err", text: data.error });
        }
    };

    const handleRevokeAllSessions = async () => {
        if (!window.confirm(t("profile.session.confirmRevoke"))) return;
        setSessionLoading(true);
        setSessionFb(null);
        const res = await fetch("/api/user/sessions", { method: "POST" });
        setSessionLoading(false);
        setSessionFb(res.ok
            ? { type: "ok", text: t("profile.session.revoked") }
            : { type: "err", text: t("profile.session.revokeFailed") }
        );
    };

    const handleDeleteAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!window.confirm(t("profile.delete.confirm"))) return;
        setDeleteLoading(true);
        setDeleteFb(null);
        const res = await fetch("/api/user/account", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: deletePw }),
        });
        const data = await res.json();
        if (res.ok) {
            await signOut({ callbackUrl: "/login" });
        } else {
            setDeleteLoading(false);
            setDeleteFb({ type: "err", text: data.error });
        }
    };

    return (
        <div className={onClose ? "h-full overflow-y-auto bg-gray-950 text-white" : "min-h-screen bg-gray-950 text-white p-4"}>
            <div className={`max-w-4xl mx-auto pt-8 pb-16 ${onClose ? "px-4" : ""}`}>

                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    {onClose ? (
                        <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                    ) : (
                        <Link href="/" className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                            <ArrowLeft size={20} />
                        </Link>
                    )}
                    <div className="flex items-center gap-2 flex-1">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                            <img src="/logo.png" alt="" className="w-5 h-5 object-contain" />
                        </div>
                        <h1 className="text-xl font-bold">{t("profile.title")}</h1>
                    </div>
                    <ThemeToggle />
                </div>

                {/* Row 1: Avatar + Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

                    {/* Avatar */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-gray-800">
                            <h2 className="font-semibold flex items-center gap-2">
                                <Camera size={17} className="text-blue-400" /> {t("profile.photo.title")}
                            </h2>
                        </div>
                        <div className="p-5 flex flex-col items-center gap-4 flex-1 justify-center">
                            <div className="relative">
                                <div className={`rounded-full overflow-hidden ${avatarLoading ? "opacity-60" : ""} transition-opacity`}>
                                    <UserAvatarDisplay image={avatarPreview} name={user.name} email={user.email} />
                                </div>
                                {avatarLoading && (
                                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                className="hidden"
                                onChange={handleAvatarFileChange}
                            />
                            <div className="flex gap-2 w-full">
                                <button
                                    type="button"
                                    disabled={avatarLoading}
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                    <Camera size={14} />
                                    {avatarPreview ? t("profile.photo.change") : t("profile.photo.upload")}
                                </button>
                                {avatarPreview && (
                                    <button
                                        type="button"
                                        disabled={avatarLoading}
                                        onClick={handleRemoveAvatar}
                                        className="flex items-center gap-2 px-3 py-2.5 border border-gray-700 hover:bg-gray-800 disabled:opacity-60 text-gray-400 hover:text-white text-sm rounded-lg transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-gray-500 text-center">{t("profile.photo.hint")}</p>
                            {avatarFb && <Alert fb={avatarFb} />}
                        </div>
                    </div>

                    {/* Usage stats */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-gray-800">
                            <h2 className="font-semibold flex items-center gap-2">
                                <BarChart2 size={17} className="text-green-400" /> {t("profile.stats.title")}
                            </h2>
                        </div>
                        <div className="p-5 flex-1">
                            {statsLoading ? (
                                <div className="space-y-3 animate-pulse h-full">
                                    <div className="grid grid-cols-3 gap-3">
                                        {[0, 1, 2].map(i => <div key={i} className="h-16 bg-gray-800 rounded-lg" />)}
                                    </div>
                                    <div className="h-24 bg-gray-800 rounded-lg" />
                                </div>
                            ) : stats ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-gray-800 rounded-lg p-3 text-center">
                                            <p className="text-2xl font-bold text-white">{stats.totalChats}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">{t("profile.stats.totalChats")}</p>
                                        </div>
                                        <div className="bg-gray-800 rounded-lg p-3 text-center">
                                            <p className="text-2xl font-bold text-white">{stats.totalMessages}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">{t("profile.stats.totalMessages")}</p>
                                        </div>
                                        <div className="bg-gray-800 rounded-lg p-3 text-center">
                                            <p className="text-2xl font-bold text-white">{fmtTokens(stats.totalInputTokens + stats.totalOutputTokens)}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">{t("profile.stats.totalTokens")}</p>
                                        </div>
                                    </div>
                                    {(() => {
                                        const maxMsg = Math.max(...stats.last7Days.map(d => d.messages), 1);
                                        return (
                                            <div>
                                                <p className="text-xs text-gray-500 mb-2">{t("profile.stats.last7Days")}</p>
                                                <div className="flex items-end gap-1 h-20">
                                                    {stats.last7Days.map((day) => (
                                                        <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                                                            <div
                                                                className="w-full bg-blue-600 rounded-t-sm min-h-[2px] transition-all"
                                                                style={{ height: `${Math.max(2, (day.messages / maxMsg) * 64)}px` }}
                                                                title={`${day.messages} messages`}
                                                            />
                                                            <span className="text-[10px] text-gray-600">{day.label}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">{t("profile.stats.failed")}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Row 2: Profile Info + Password */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

                    {/* Update profile */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="p-5 border-b border-gray-800">
                            <h2 className="font-semibold flex items-center gap-2">
                                <User size={17} className="text-blue-400" /> {t("profile.info.title")}
                            </h2>
                        </div>
                        <form onSubmit={handleUpdateProfile} className="p-5 space-y-4">
                            <Alert fb={profileFb} />
                            <div>
                                <label className="block mb-1.5 text-sm text-gray-300">{t("profile.info.name")}</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                />
                            </div>
                            <div>
                                <label className="block mb-1.5 text-sm text-gray-300">{t("profile.info.email")}</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={profileLoading}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                            >
                                {profileLoading ? t("profile.info.saving") : t("profile.info.save")}
                            </button>
                        </form>
                    </div>

                    {/* Change password */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="p-5 border-b border-gray-800">
                            <h2 className="font-semibold flex items-center gap-2">
                                <Lock size={17} className="text-yellow-400" /> {t("profile.password.title")}
                            </h2>
                        </div>
                        <form onSubmit={handleChangePassword} className="p-5 space-y-4">
                            <Alert fb={pwFb} />
                            {[
                                { label: t("profile.password.current"), value: currentPw, set: setCurrentPw },
                                { label: t("profile.password.newPw"), value: newPw, set: setNewPw },
                                { label: t("profile.password.confirm"), value: confirmPw, set: setConfirmPw },
                            ].map(({ label, value, set }) => (
                                <div key={label}>
                                    <label className="block mb-1.5 text-sm text-gray-300">{label}</label>
                                    <input
                                        type="password"
                                        value={value}
                                        onChange={(e) => set(e.target.value)}
                                        required
                                        className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    />
                                </div>
                            ))}
                            <button
                                type="submit"
                                disabled={pwLoading}
                                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                            >
                                {pwLoading ? t("profile.password.changing") : t("profile.password.change")}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Row 3: System Prompt (full width) */}
                <div className="mb-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="p-5 border-b border-gray-800">
                            <h2 className="font-semibold flex items-center gap-2">
                                <MessageSquare size={17} className="text-purple-400" /> {t("profile.systemPrompt.title")}
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">{t("profile.systemPrompt.desc")}</p>
                        </div>
                        <form onSubmit={handleSaveSystemPrompt} className="p-5 space-y-4">
                            <Alert fb={promptFb} />
                            <textarea
                                value={systemPrompt}
                                onChange={(e) => setSystemPrompt(e.target.value)}
                                rows={4}
                                placeholder={t("profile.systemPrompt.placeholder")}
                                className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm resize-none"
                            />
                            <button
                                type="submit"
                                disabled={promptLoading}
                                className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                            >
                                {promptLoading ? t("profile.systemPrompt.saving") : t("profile.systemPrompt.save")}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Row 4: Display Language (full width) */}
                <div className="mb-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="p-5 border-b border-gray-800">
                            <h2 className="font-semibold flex items-center gap-2">
                                <Globe size={17} className="text-cyan-400" /> {t("profile.language.title")}
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">{t("profile.language.desc")}</p>
                        </div>
                        <form onSubmit={handleSaveLocale} className="p-5 space-y-4">
                            <Alert fb={localeFb} />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {LOCALES.map((loc) => (
                                    <label
                                        key={loc}
                                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                            selectedLocale === loc
                                                ? "border-cyan-500 bg-cyan-900/20"
                                                : "border-gray-700 hover:border-gray-600 hover:bg-gray-800/50"
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="locale"
                                            value={loc}
                                            checked={selectedLocale === loc}
                                            onChange={() => setSelectedLocale(loc)}
                                            className="accent-cyan-500"
                                        />
                                        <span className={`text-sm font-medium ${selectedLocale === loc ? "text-cyan-300" : "text-gray-300"}`}>
                                            {LOCALE_NAMES[loc]}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <button
                                type="submit"
                                disabled={localeLoading || selectedLocale === locale}
                                className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                            >
                                {localeLoading ? t("profile.language.saving") : t("profile.language.save")}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Row 5: Session + Delete Account */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* Session management */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="p-5 border-b border-gray-800">
                            <h2 className="font-semibold flex items-center gap-2">
                                <ShieldAlert size={17} className="text-orange-400" /> {t("profile.session.title")}
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">{t("profile.session.desc")}</p>
                        </div>
                        <div className="p-5 space-y-4">
                            <Alert fb={sessionFb} />
                            <button
                                type="button"
                                onClick={handleRevokeAllSessions}
                                disabled={sessionLoading}
                                className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                            >
                                {sessionLoading ? t("profile.session.processing") : t("profile.session.revokeAll")}
                            </button>
                        </div>
                    </div>

                    {/* Delete account */}
                    <div className="bg-gray-900 border border-red-900/40 rounded-xl overflow-hidden">
                        <div className="p-5 border-b border-red-900/40">
                            <h2 className="font-semibold flex items-center gap-2 text-red-400">
                                <Trash2 size={17} /> {t("profile.delete.title")}
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">{t("profile.delete.desc")}</p>
                        </div>
                        <form onSubmit={handleDeleteAccount} className="p-5 space-y-4">
                            <Alert fb={deleteFb} />
                            <div>
                                <label className="block mb-1.5 text-sm text-gray-300">{t("profile.delete.confirmLabel")}</label>
                                <input
                                    type="password"
                                    value={deletePw}
                                    onChange={(e) => setDeletePw(e.target.value)}
                                    required
                                    placeholder={t("profile.delete.placeholder")}
                                    className="w-full p-3 bg-gray-800 border border-red-900/50 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={deleteLoading}
                                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                            >
                                {deleteLoading ? t("profile.delete.deleting") : t("profile.delete.delete")}
                            </button>
                        </form>
                    </div>
                </div>

            </div>
        </div>
    );
}
