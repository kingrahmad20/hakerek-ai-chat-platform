"use client";

import { useState, useEffect, useActionState, useRef } from "react";
import { Settings, Activity, Mail, Wifi, CheckCircle, XCircle, Loader2, Paperclip, ImageIcon, Upload, Wrench, Globe, Mic } from "lucide-react";
import { changePassword, saveSMTP, saveEmailSettings, saveFileSettings, saveMaintenanceMode, saveAppSettings, saveVoiceSettings } from "@/app/admin/actions";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/providers/toast-provider";

interface SmtpSettings {
    host: string;
    port: string;
    user: string;
    pass: string;
    from: string;
    secure: string;
}

interface Props {
    smtp: SmtpSettings;
    emailVerificationRequired: boolean;
    allowFileUpload: boolean;
    maintenanceModeEnabled: boolean;
    logoVersion: string;
    faviconVersion: string;
    appName: string;
    appDescription: string;
    voice: {
        sttEnabled: boolean;
        sttModel: string;
        sttLanguage: string;
        ttsEnabled: boolean;
        ttsProvider: string;
        ttsModel: string;
        ttsVoice: string;
        elevenLabsConfigured: boolean;
        elevenLabsVoiceId: string;
        elevenLabsModelId: string;
    };
    error?: string;
    success?: string;
}

type TestResult = { ok: true; message: string } | { ok: false; error: string } | null;

export function SettingsTab({ smtp, emailVerificationRequired, allowFileUpload, maintenanceModeEnabled, logoVersion, faviconVersion, appName, appDescription, voice, error, success }: Props) {
    const { toast } = useToast();
    const smtpConfigured = !!(smtp.host && smtp.user && smtp.pass);

    const [host, setHost] = useState(smtp.host);
    const [port, setPort] = useState(smtp.port || "587");
    const [user, setUser] = useState(smtp.user);
    const [pass, setPass] = useState(smtp.pass);
    const [from, setFrom] = useState(smtp.from);
    const [secure, setSecure] = useState(smtp.secure === "true");

    useEffect(() => {
        setHost(smtp.host);
        setPort(smtp.port || "587");
        setUser(smtp.user);
        setPass(smtp.pass);
        setFrom(smtp.from);
        setSecure(smtp.secure === "true");
    }, [smtp.host, smtp.port, smtp.user, smtp.pass, smtp.from, smtp.secure]);

    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult>(null);

    const [smtpState, smtpFormAction, smtpPending] = useActionState(saveSMTP, null);
    const [emailState, emailFormAction, emailPending] = useActionState(saveEmailSettings, null);
    const [fileState, fileFormAction, filePending] = useActionState(saveFileSettings, null);
    const [maintenanceState, maintenanceFormAction, maintenancePending] = useActionState(saveMaintenanceMode, null);
    const [appState, appFormAction, appPending] = useActionState(saveAppSettings, null);
    const [voiceState, voiceFormAction, voicePending] = useActionState(saveVoiceSettings, null);

    const [ttsProvider, setTtsProvider] = useState(voice.ttsProvider === "elevenlabs" ? "elevenlabs" : "openai");

    const [logoVer, setLogoVer] = useState(logoVersion);
    const [favVer, setFavVer] = useState(faviconVersion);
    const [logoUploading, setLogoUploading] = useState(false);
    const [favUploading, setFavUploading] = useState(false);
    const logoInputRef = useRef<HTMLInputElement>(null);
    const favInputRef = useRef<HTMLInputElement>(null);

    const uploadAsset = async (type: "logo" | "favicon", file: File) => {
        const setUploading = type === "logo" ? setLogoUploading : setFavUploading;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("type", type);
            fd.append("file", file);
            const res = await fetch("/api/admin/upload-asset", { method: "POST", body: fd });
            const data = await res.json();
            if (!res.ok) {
                toast(data.error || "Upload failed", "error");
            } else {
                if (type === "logo") setLogoVer(data.version);
                else setFavVer(data.version);
                toast(type === "logo" ? "Logo updated successfully" : "Favicon updated successfully", "success");
            }
        } catch {
            toast("Upload failed, check your connection", "error");
        } finally {
            setUploading(false);
        }
    };

    useEffect(() => {
        if (!smtpState) return;
        toast(smtpState.message, smtpState.ok ? "success" : "error");
    }, [smtpState]);

    useEffect(() => {
        if (!emailState) return;
        toast(emailState.message, emailState.ok ? "success" : "error");
    }, [emailState]);

    useEffect(() => {
        if (!fileState) return;
        toast(fileState.message, fileState.ok ? "success" : "error");
    }, [fileState]);

    useEffect(() => {
        if (!maintenanceState) return;
        toast(maintenanceState.message, maintenanceState.ok ? "success" : "error");
    }, [maintenanceState]);

    useEffect(() => {
        if (!appState) return;
        toast(appState.message, appState.ok ? "success" : "error");
    }, [appState]);

    useEffect(() => {
        if (!voiceState) return;
        toast(voiceState.message, voiceState.ok ? "success" : "error");
    }, [voiceState]);

    const handleTestConnection = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch("/api/admin/smtp-test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ host, port, user, pass, secure }),
            });
            const data = await res.json();
            if (!res.ok) {
                setTestResult({ ok: false, error: data.error || "Failed to reach server." });
            } else {
                setTestResult(data.ok ? { ok: true, message: data.message } : { ok: false, error: data.error });
            }
        } catch {
            setTestResult({ ok: false, error: "Cannot connect to server. Check your network connection." });
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* App Identity */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-gray-800">
                    <h2 className="font-semibold flex items-center gap-2">
                        <Globe size={20} className="text-blue-400" /> App Identity
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Customize the site name and description used in browser tabs and SEO metadata.</p>
                </div>
                <form action={appFormAction} className="p-6 space-y-4">
                    <div>
                        <label className="block mb-1 text-sm font-medium text-gray-300">App Name</label>
                        <input
                            name="appName"
                            type="text"
                            defaultValue={appName}
                            maxLength={100}
                            placeholder="Hakerek"
                            className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        />
                    </div>
                    <div>
                        <label className="block mb-1 text-sm font-medium text-gray-300">App Description</label>
                        <textarea
                            name="appDescription"
                            defaultValue={appDescription}
                            maxLength={300}
                            rows={2}
                            placeholder="Your intelligent AI assistant for every question."
                            className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={appPending}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-3 px-6 rounded-lg transition-colors text-sm"
                    >
                        {appPending ? "Saving..." : "Save App Settings"}
                    </button>
                </form>
            </div>

            {/* Branding — directly after App Identity */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-gray-800">
                    <h2 className="font-semibold flex items-center gap-2">
                        <ImageIcon size={20} className="text-blue-400" /> Branding
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Change application logo and favicon.</p>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Logo */}
                    <div className="space-y-3">
                        <p className="text-sm font-medium text-gray-300">Application Logo</p>
                        <div className="flex items-center gap-4 p-4 bg-gray-800 rounded-xl">
                            <div className="w-14 h-14 rounded-lg bg-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                                <img
                                    src={`/logo.png?v=${logoVer}`}
                                    alt="Logo"
                                    className="w-10 h-10 object-contain"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-500 mb-2">PNG, JPG, or WebP · max 2MB</p>
                                <button
                                    type="button"
                                    onClick={() => logoInputRef.current?.click()}
                                    disabled={logoUploading}
                                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors"
                                >
                                    {logoUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                    {logoUploading ? "Uploading..." : "Change Logo"}
                                </button>
                            </div>
                        </div>
                        <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) uploadAsset("logo", file);
                                e.target.value = "";
                            }}
                        />
                    </div>

                    {/* Favicon */}
                    <div className="space-y-3">
                        <p className="text-sm font-medium text-gray-300">Favicon</p>
                        <div className="flex items-center gap-4 p-4 bg-gray-800 rounded-xl">
                            <div className="w-14 h-14 rounded-lg bg-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                                <img
                                    src={`/favicon.ico?v=${favVer}`}
                                    alt="Favicon"
                                    className="w-8 h-8 object-contain"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-500 mb-2">ICO, PNG, or GIF · max 2MB</p>
                                <button
                                    type="button"
                                    onClick={() => favInputRef.current?.click()}
                                    disabled={favUploading}
                                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors"
                                >
                                    {favUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                    {favUploading ? "Uploading..." : "Change Favicon"}
                                </button>
                            </div>
                        </div>
                        <input
                            ref={favInputRef}
                            type="file"
                            accept="image/x-icon,image/vnd.microsoft.icon,image/png,image/gif"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) uploadAsset("favicon", file);
                                e.target.value = "";
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Row 1 — 3 columns */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Change Password */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-gray-800">
                        <h2 className="font-semibold flex items-center gap-2">
                            <Settings size={20} className="text-blue-400" /> Change Password
                        </h2>
                    </div>
                    <form action={changePassword} className="p-6 space-y-4 flex-1 flex flex-col">
                        {error === "invalid" && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">Current password is incorrect.</p>}
                        {error === "mismatch" && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">Passwords do not match.</p>}
                        {error === "tooshort" && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">New password must be at least 8 characters.</p>}
                        {success === "password" && <p className="text-sm text-green-400 bg-green-900/20 border border-green-800 rounded-lg px-3 py-2">Password changed successfully.</p>}
                        <div className="flex-1 space-y-4">
                            {[
                                { name: "currentPassword", label: "Current Password" },
                                { name: "newPassword", label: "New Password" },
                                { name: "confirmPassword", label: "Confirm New Password" },
                            ].map((field) => (
                                <div key={field.name}>
                                    <label className="block mb-1 text-sm font-medium text-gray-300">{field.label}</label>
                                    <input
                                        name={field.name}
                                        type="password"
                                        required
                                        className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    />
                                </div>
                            ))}
                        </div>
                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors mt-auto">
                            Save Password
                        </button>
                    </form>
                </div>

                {/* Email Verification */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-gray-800">
                        <h2 className="font-semibold flex items-center gap-2">
                            <Mail size={20} className="text-blue-400" /> Email Verification
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Require users to verify email after registration.</p>
                    </div>
                    <form action={emailFormAction} className="p-6 space-y-4 flex-1 flex flex-col">
                        {!smtpConfigured && (
                            <div className="p-3 bg-yellow-500/10 border border-yellow-600/30 rounded-lg text-yellow-400 text-sm">
                                SMTP not configured. Email verification will not work without SMTP.
                            </div>
                        )}
                        <div className="flex-1 space-y-4">
                            <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                <label htmlFor="email-ver" className="text-sm font-medium text-gray-300 cursor-pointer select-none flex-1">
                                    Require email verification on registration
                                </label>
                                <div className="flex items-center gap-2.5 shrink-0">
                                    {emailVerificationRequired && (
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">ON</span>
                                    )}
                                    <Toggle name="emailVerificationRequired" id="email-ver" defaultChecked={emailVerificationRequired} />
                                </div>
                            </div>
                            {emailVerificationRequired && (
                                <p className="text-xs text-gray-500">
                                    Users who haven&apos;t verified their email cannot log in. Password reset via email is still available at any time.
                                </p>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={emailPending}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-3 rounded-lg transition-colors mt-auto"
                        >
                            {emailPending ? "Saving..." : "Save Email Settings"}
                        </button>
                    </form>
                </div>

                {/* File Upload */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-gray-800">
                        <h2 className="font-semibold flex items-center gap-2">
                            <Paperclip size={20} className="text-blue-400" /> File Upload
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Allow users to attach images in conversations.</p>
                    </div>
                    <form action={fileFormAction} className="p-6 space-y-4 flex-1 flex flex-col">
                        <div className="flex-1 space-y-4">
                            <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                <label htmlFor="file-upload" className="text-sm font-medium text-gray-300 cursor-pointer select-none flex-1">
                                    Allow image upload in chat
                                </label>
                                <div className="flex items-center gap-2.5 shrink-0">
                                    {allowFileUpload && (
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">ON</span>
                                    )}
                                    <Toggle name="allowFileUpload" id="file-upload" defaultChecked={allowFileUpload} />
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">
                                Images are compressed on the client side and sent with the message. Only JPEG, PNG, WebP formats are supported.
                            </p>
                        </div>
                        <button
                            type="submit"
                            disabled={filePending}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-3 rounded-lg transition-colors mt-auto"
                        >
                            {filePending ? "Saving..." : "Save Upload Settings"}
                        </button>
                    </form>
                </div>
            </div>

            {/* Maintenance Mode */}
            <div className="bg-gray-900 border border-yellow-600/30 rounded-xl overflow-hidden flex flex-col">
                <div className="p-6 border-b border-yellow-600/20">
                    <h2 className="font-semibold flex items-center gap-2">
                        <Wrench size={20} className="text-yellow-400" /> Maintenance Mode
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">When enabled, only admins can access the platform. All other users see a maintenance page.</p>
                </div>
                <form action={maintenanceFormAction} className="p-6 space-y-4 flex-1 flex flex-col">
                    <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                            <label htmlFor="maintenance-toggle" className="text-sm font-medium text-gray-300 cursor-pointer select-none flex-1">
                                Enable Maintenance Mode
                            </label>
                            <div className="flex items-center gap-2.5 shrink-0">
                                {maintenanceModeEnabled && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-medium">ON</span>
                                )}
                                <Toggle name="maintenanceModeEnabled" id="maintenance-toggle" defaultChecked={maintenanceModeEnabled} />
                            </div>
                        </div>
                        {maintenanceModeEnabled && (
                            <p className="text-xs text-yellow-500/80 bg-yellow-500/10 border border-yellow-600/20 rounded-lg px-3 py-2">
                                Maintenance mode is active. Admin accounts can still log in and access the admin panel normally.
                            </p>
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={maintenancePending}
                        className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:opacity-60 text-white font-medium py-3 rounded-lg transition-colors mt-auto"
                    >
                        {maintenancePending ? "Saving..." : "Save Maintenance Settings"}
                    </button>
                </form>
            </div>

            {/* Voice — Speech-to-Text & Text-to-Speech */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-gray-800">
                    <h2 className="font-semibold flex items-center gap-2">
                        <Mic size={20} className="text-blue-400" /> Voice (Speech)
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Server-side voice input (Whisper transcription) and read-aloud (text-to-speech).
                        The OpenAI option reuses the OpenAI key from the API Keys tab. When disabled, the chat
                        falls back to the browser&apos;s built-in Web Speech API.
                    </p>
                </div>
                <form action={voiceFormAction} className="p-6 space-y-6">
                    {/* Speech-to-Text */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                            <label htmlFor="stt-toggle" className="text-sm font-medium text-gray-300 cursor-pointer select-none flex-1">
                                Voice input (Whisper speech-to-text)
                            </label>
                            <div className="flex items-center gap-2.5 shrink-0">
                                {voice.sttEnabled && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">ON</span>
                                )}
                                <Toggle name="sttEnabled" id="stt-toggle" defaultChecked={voice.sttEnabled} />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block mb-1 text-sm text-gray-300">Transcription model</label>
                                <input
                                    name="sttModel" type="text" defaultValue={voice.sttModel} placeholder="whisper-1"
                                    className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                />
                            </div>
                            <div>
                                <label className="block mb-1 text-sm text-gray-300">Language hint (optional)</label>
                                <input
                                    name="sttLanguage" type="text" defaultValue={voice.sttLanguage} placeholder="auto (e.g. en, id)"
                                    maxLength={10}
                                    className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-800" />

                    {/* Text-to-Speech */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                            <label htmlFor="tts-toggle" className="text-sm font-medium text-gray-300 cursor-pointer select-none flex-1">
                                Read aloud (text-to-speech)
                            </label>
                            <div className="flex items-center gap-2.5 shrink-0">
                                {voice.ttsEnabled && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">ON</span>
                                )}
                                <Toggle name="ttsEnabled" id="tts-toggle" defaultChecked={voice.ttsEnabled} />
                            </div>
                        </div>
                        <div>
                            <label className="block mb-1 text-sm text-gray-300">TTS provider</label>
                            <select
                                name="ttsProvider"
                                value={ttsProvider}
                                onChange={(e) => setTtsProvider(e.target.value)}
                                className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            >
                                <option value="openai">OpenAI (uses OpenAI API key)</option>
                                <option value="elevenlabs">ElevenLabs</option>
                            </select>
                        </div>

                        {ttsProvider === "openai" ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block mb-1 text-sm text-gray-300">Model</label>
                                    <select
                                        name="ttsModel" defaultValue={voice.ttsModel || "tts-1"}
                                        className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    >
                                        <option value="tts-1">tts-1 (fast)</option>
                                        <option value="tts-1-hd">tts-1-hd (higher quality)</option>
                                        <option value="gpt-4o-mini-tts">gpt-4o-mini-tts</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block mb-1 text-sm text-gray-300">Voice</label>
                                    <select
                                        name="ttsVoice" defaultValue={voice.ttsVoice || "alloy"}
                                        className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    >
                                        {["alloy", "echo", "fable", "onyx", "nova", "shimmer", "ash", "sage", "coral"].map((v) => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block mb-1 text-sm text-gray-300">
                                        ElevenLabs API key {voice.elevenLabsConfigured && <span className="text-xs text-green-400">(configured)</span>}
                                    </label>
                                    <input
                                        name="elevenLabsApiKey" type="password" autoComplete="off"
                                        placeholder={voice.elevenLabsConfigured ? "•••••••• (leave blank to keep)" : "sk_..."}
                                        className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block mb-1 text-sm text-gray-300">Voice ID</label>
                                        <input
                                            name="elevenLabsVoiceId" type="text" defaultValue={voice.elevenLabsVoiceId} placeholder="21m00Tcm4TlvDq8ikWAM"
                                            className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block mb-1 text-sm text-gray-300">Model ID</label>
                                        <input
                                            name="elevenLabsModelId" type="text" defaultValue={voice.elevenLabsModelId} placeholder="eleven_multilingual_v2"
                                            className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={voicePending}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-3 px-6 rounded-lg transition-colors text-sm"
                    >
                        {voicePending ? "Saving..." : "Save Voice Settings"}
                    </button>
                </form>
            </div>

            {/* SMTP full width */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-gray-800">
                    <h2 className="font-semibold flex items-center gap-2">
                        <Activity size={20} className="text-green-400" /> SMTP Configuration
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Used for sending password reset and verification emails.</p>
                </div>
                <form action={smtpFormAction} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block mb-1 text-sm text-gray-300">SMTP Host</label>
                            <input
                                name="smtp_host" type="text" placeholder="smtp.gmail.com"
                                value={host} onChange={(e) => { setHost(e.target.value); setTestResult(null); }}
                                className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block mb-1 text-sm text-gray-300">Port</label>
                            <input
                                name="smtp_port" type="number"
                                value={port} onChange={(e) => { setPort(e.target.value); setTestResult(null); }}
                                className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block mb-1 text-sm text-gray-300">Username</label>
                        <input
                            name="smtp_user" type="text" placeholder="user@gmail.com"
                            value={user} onChange={(e) => { setUser(e.target.value); setTestResult(null); }}
                            className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        />
                    </div>

                    <div>
                        <label className="block mb-1 text-sm text-gray-300">Password</label>
                        <input
                            name="smtp_pass" type="password"
                            value={pass} onChange={(e) => { setPass(e.target.value); setTestResult(null); }}
                            className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        />
                    </div>

                    <div>
                        <label className="block mb-1 text-sm text-gray-300">From Address</label>
                        <input
                            name="smtp_from" type="email" placeholder="noreply@hakerek.com"
                            value={from} onChange={(e) => setFrom(e.target.value)}
                            className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                        <label htmlFor="smtp_secure" className="text-sm text-gray-300 cursor-pointer select-none flex-1">
                            Use SSL/TLS
                        </label>
                        <Toggle
                            key={String(secure)}
                            name="smtp_secure"
                            id="smtp_secure"
                            defaultChecked={secure}
                        />
                    </div>

                    {/* Test result banner */}
                    {testResult && (
                        <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-sm ${
                            testResult.ok
                                ? "bg-green-900/20 border-green-800 text-green-400"
                                : "bg-red-900/20 border-red-800 text-red-400"
                        }`}>
                            {testResult.ok
                                ? <CheckCircle size={16} className="shrink-0 mt-0.5" />
                                : <XCircle size={16} className="shrink-0 mt-0.5" />
                            }
                            <span>{testResult.ok ? testResult.message : testResult.error}</span>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={handleTestConnection}
                            disabled={testing || !host || !user || !pass}
                            className="flex items-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            {testing
                                ? <Loader2 size={15} className="animate-spin" />
                                : <Wifi size={15} />
                            }
                            {testing ? "Testing..." : "Test Connection"}
                        </button>
                        <button
                            type="submit"
                            disabled={smtpPending}
                            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium py-3 rounded-lg transition-colors text-sm"
                        >
                            {smtpPending ? "Saving..." : "Save SMTP Configuration"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
