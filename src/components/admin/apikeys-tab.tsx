"use client";

import { useActionState, useEffect } from "react";
import { Shield, Globe, Layers, Cpu, KeyRound, HardDrive } from "lucide-react";
import { saveTurnstile, saveGoogleOAuth, saveOidcSso, saveCohereSettings, saveProviderApiKeys, saveConnectorGoogle } from "@/app/admin/actions";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/providers/toast-provider";


interface TurnstileConfig {
    siteKey: string;
    secretKey: string;
    enabled: boolean;
}

interface GoogleOAuthConfig {
    clientId: string;
    clientSecret: string;
    enabled: boolean;
}

interface OidcSsoConfig {
    name: string;
    issuer: string;
    clientId: string;
    clientSecret: string;
    enabled: boolean;
}

interface CohereConfig {
    apiKey: string;
    enabled: boolean;
}

interface ProviderApiKeysConfig {
    openrouter:    string;
    openai:        string;
    openaiBaseUrl: string;
    anthropic:     string;
    deepseek:      string;
    qwen:          string;
}

interface ConnectorGoogleConfig {
    clientId: string;
    clientSecret: string;
}

export function ApiKeysTab({ turnstile, googleOAuth, oidcSso, cohere, connectorGoogle, providerApiKeys }: {
    turnstile: TurnstileConfig;
    googleOAuth: GoogleOAuthConfig;
    oidcSso: OidcSsoConfig;
    cohere: CohereConfig;
    connectorGoogle: ConnectorGoogleConfig;
    providerApiKeys: ProviderApiKeysConfig;
}) {
    const { toast } = useToast();

    const [turnstileState, turnstileFormAction, turnstilePending] = useActionState(saveTurnstile, null);
    const [googleState, googleFormAction, googlePending] = useActionState(saveGoogleOAuth, null);
    const [oidcState, oidcFormAction, oidcPending] = useActionState(saveOidcSso, null);
    const [cohereState, cohereFormAction, coherePending] = useActionState(saveCohereSettings, null);
    const [connectorState, connectorFormAction, connectorPending] = useActionState(saveConnectorGoogle, null);
    const [providerState, providerFormAction, providerPending] = useActionState(saveProviderApiKeys, null);

    useEffect(() => {
        if (!turnstileState) return;
        toast(turnstileState.message, turnstileState.ok ? "success" : "error");
    }, [turnstileState]);

    useEffect(() => {
        if (!googleState) return;
        toast(googleState.message, googleState.ok ? "success" : "error");
    }, [googleState]);

    useEffect(() => {
        if (!oidcState) return;
        toast(oidcState.message, oidcState.ok ? "success" : "error");
    }, [oidcState]);

    useEffect(() => {
        if (!cohereState) return;
        toast(cohereState.message, cohereState.ok ? "success" : "error");
    }, [cohereState]);

    useEffect(() => {
        if (!connectorState) return;
        toast(connectorState.message, connectorState.ok ? "success" : "error");
    }, [connectorState]);

    useEffect(() => {
        if (!providerState) return;
        toast(providerState.message, providerState.ok ? "success" : "error");
    }, [providerState]);

    return (
        <div className="space-y-6">
            {/* Cloudflare Turnstile */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-gray-800">
                    <h2 className="font-semibold flex items-center gap-2">
                        <Shield size={18} className="text-orange-400" /> Cloudflare Turnstile
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Protect login & registration forms from bots. Get keys at dash.cloudflare.com.</p>
                </div>
                <form action={turnstileFormAction} className="p-5 space-y-4">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                            <label htmlFor="turnstile-enabled" className="text-sm font-medium text-gray-300 cursor-pointer select-none flex-1">
                                Enable Turnstile on login & registration forms
                            </label>
                            <div className="flex items-center gap-2.5 shrink-0">
                                {turnstile.enabled && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">ON</span>
                                )}
                                <Toggle name="enabled" id="turnstile-enabled" defaultChecked={turnstile.enabled} />
                            </div>
                        </div>
                        <div>
                            <label className="block mb-1.5 text-sm font-medium text-gray-300">Site Key <span className="text-gray-500 font-normal">(public)</span></label>
                            <input
                                name="siteKey"
                                type="text"
                                defaultValue={turnstile.siteKey}
                                placeholder="0x4AAAAAAA..."
                                className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                            />
                        </div>
                        <div>
                            <label className="block mb-1.5 text-sm font-medium text-gray-300">Secret Key <span className="text-gray-500 font-normal">(private)</span></label>
                            <input
                                name="secretKey"
                                type="password"
                                defaultValue={turnstile.secretKey}
                                placeholder="0x4AAAAAAA..."
                                className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                            />
                            <p className="text-xs text-gray-600 mt-1">Both keys are required to enable Turnstile.</p>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={turnstilePending}
                        className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-medium py-3 rounded-lg transition-colors text-sm"
                    >
                        {turnstilePending ? "Saving..." : "Save Turnstile Settings"}
                    </button>
                </form>
            </div>

            {/* Row 3 — Google OAuth full width */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-gray-800">
                    <h2 className="font-semibold flex items-center gap-2">
                        <Globe size={18} className="text-blue-400" /> Google OAuth
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Allow users to log in with Google. Create credentials at{" "}
                        <span className="text-gray-400">console.cloud.google.com → APIs & Services → Credentials</span>.
                    </p>
                </div>
                <form action={googleFormAction} className="p-5">
                    <div className="grid grid-cols-1 gap-5">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                <label htmlFor="google-enabled" className="text-sm font-medium text-gray-300 cursor-pointer select-none flex-1">
                                    Enable Google Login
                                </label>
                                <div className="flex items-center gap-2.5 shrink-0">
                                    {googleOAuth.enabled && (
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">ON</span>
                                    )}
                                    <Toggle name="googleEnabled" id="google-enabled" defaultChecked={googleOAuth.enabled} />
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Make sure the Authorized redirect URI in Google Console has been added:{" "}
                                <code className="text-gray-400 bg-gray-800 px-1 py-0.5 rounded text-xs">
                                    https://hakerek.com/api/auth/callback/google
                                </code>
                            </p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block mb-1.5 text-sm font-medium text-gray-300">Client ID</label>
                                <input
                                    name="googleClientId"
                                    type="text"
                                    defaultValue={googleOAuth.clientId}
                                    placeholder="123456789-abc...apps.googleusercontent.com"
                                    className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                                />
                            </div>
                            <div>
                                <label className="block mb-1.5 text-sm font-medium text-gray-300">Client Secret</label>
                                <input
                                    name="googleClientSecret"
                                    type="password"
                                    defaultValue={googleOAuth.clientSecret}
                                    placeholder="GOCSPX-..."
                                    className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="mt-5 flex justify-end">
                        <button
                            type="submit"
                            disabled={googlePending}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
                        >
                            {googlePending ? "Saving..." : "Save Google Settings"}
                        </button>
                    </div>
                </form>
            </div>

            {/* OIDC SSO (enterprise single sign-on) */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-gray-800">
                    <h2 className="font-semibold flex items-center gap-2">
                        <KeyRound size={18} className="text-purple-400" /> Enterprise SSO (OpenID Connect)
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Allow an organization to log in with their own identity provider (Okta, Microsoft Entra ID, Auth0, Google Workspace, …).
                        New users are provisioned automatically on first sign-in.
                    </p>
                </div>
                <form action={oidcFormAction} className="p-5">
                    <div className="grid grid-cols-1 gap-5">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                <label htmlFor="oidc-enabled" className="text-sm font-medium text-gray-300 cursor-pointer select-none flex-1">
                                    Enable SSO Login
                                </label>
                                <div className="flex items-center gap-2.5 shrink-0">
                                    {oidcSso.enabled && (
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">ON</span>
                                    )}
                                    <Toggle name="oidcEnabled" id="oidc-enabled" defaultChecked={oidcSso.enabled} />
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Register this redirect / callback URL at your identity provider:{" "}
                                <code className="text-gray-400 bg-gray-800 px-1 py-0.5 rounded text-xs">
                                    https://hakerek.com/api/auth/callback/oidc
                                </code>
                            </p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block mb-1.5 text-sm font-medium text-gray-300">Display Name <span className="text-gray-500 font-normal">(shown on the login button)</span></label>
                                <input
                                    name="oidcName"
                                    type="text"
                                    defaultValue={oidcSso.name}
                                    placeholder="Okta"
                                    className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                />
                            </div>
                            <div>
                                <label className="block mb-1.5 text-sm font-medium text-gray-300">Issuer URL</label>
                                <input
                                    name="oidcIssuer"
                                    type="text"
                                    defaultValue={oidcSso.issuer}
                                    placeholder="https://your-org.okta.com"
                                    className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                                />
                                <p className="text-xs text-gray-600 mt-1">Discovery is read from <code className="bg-gray-800 px-1 rounded">{"{issuer}"}/.well-known/openid-configuration</code>.</p>
                            </div>
                            <div>
                                <label className="block mb-1.5 text-sm font-medium text-gray-300">Client ID</label>
                                <input
                                    name="oidcClientId"
                                    type="text"
                                    defaultValue={oidcSso.clientId}
                                    placeholder="0oa1b2c3d4..."
                                    className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                                />
                            </div>
                            <div>
                                <label className="block mb-1.5 text-sm font-medium text-gray-300">Client Secret</label>
                                <input
                                    name="oidcClientSecret"
                                    type="password"
                                    defaultValue={oidcSso.clientSecret}
                                    placeholder="••••••••"
                                    className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                                />
                                <p className="text-xs text-gray-600 mt-1">Issuer URL, Client ID, and Secret are all required to enable SSO.</p>
                            </div>
                        </div>
                    </div>
                    <div className="mt-5 flex justify-end">
                        <button
                            type="submit"
                            disabled={oidcPending}
                            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
                        >
                            {oidcPending ? "Saving..." : "Save SSO Settings"}
                        </button>
                    </div>
                </form>
            </div>

            {/* Row 4 — Provider API Keys */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-gray-800">
                    <h2 className="font-semibold flex items-center gap-2">
                        <Cpu size={18} className="text-cyan-400" /> Provider API Keys
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Configure API keys for OpenRouter and direct providers (OpenAI, Anthropic, DeepSeek, Qwen).
                        Use the <code className="text-gray-400 bg-gray-800 px-1 rounded text-xs">provider:model-id</code> format
                        when setting up direct-provider models (e.g. <code className="text-gray-400 bg-gray-800 px-1 rounded text-xs">openai:gpt-4o</code>,{" "}
                        <code className="text-gray-400 bg-gray-800 px-1 rounded text-xs">anthropic:claude-sonnet-4-6</code>).
                    </p>
                </div>
                <form action={providerFormAction} className="p-5 space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                        {/* OpenRouter */}
                        <div>
                            <label className="block mb-1.5 text-sm font-medium text-gray-300 flex items-center gap-2">
                                <span className="inline-block w-2 h-2 rounded-full bg-blue-400" /> OpenRouter API Key
                            </label>
                            <input
                                name="openrouterApiKey"
                                type="password"
                                defaultValue={providerApiKeys.openrouter}
                                placeholder="sk-or-v1-..."
                                className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none font-mono text-sm"
                            />
                            <p className="text-xs text-gray-600 mt-1">Get your key at openrouter.ai/keys</p>
                        </div>

                        {/* OpenAI */}
                        <div>
                            <label className="block mb-1.5 text-sm font-medium text-gray-300 flex items-center gap-2">
                                <span className="inline-block w-2 h-2 rounded-full bg-green-400" /> OpenAI API Key
                            </label>
                            <input
                                name="openaiApiKey"
                                type="password"
                                defaultValue={providerApiKeys.openai}
                                placeholder="sk-..."
                                className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none font-mono text-sm"
                            />
                            <p className="text-xs text-gray-600 mt-1">Get your key at platform.openai.com/api-keys</p>
                            <label className="block mt-3 mb-1.5 text-sm font-medium text-gray-300">Base URL <span className="text-gray-500 font-normal">(optional)</span></label>
                            <input
                                name="openaiBaseUrl"
                                type="text"
                                defaultValue={providerApiKeys.openaiBaseUrl}
                                placeholder="https://api.openai.com/v1"
                                className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none font-mono text-sm"
                            />
                            <p className="text-xs text-gray-600 mt-1">Override for OpenAI-compatible endpoints (Azure OpenAI, LM Studio, Ollama, vLLM, etc.). Leave blank to use the default OpenAI API.</p>
                        </div>

                        {/* Anthropic */}
                        <div>
                            <label className="block mb-1.5 text-sm font-medium text-gray-300 flex items-center gap-2">
                                <span className="inline-block w-2 h-2 rounded-full bg-orange-400" /> Anthropic API Key
                            </label>
                            <input
                                name="anthropicApiKey"
                                type="password"
                                defaultValue={providerApiKeys.anthropic}
                                placeholder="sk-ant-..."
                                className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none font-mono text-sm"
                            />
                            <p className="text-xs text-gray-600 mt-1">Get your key at console.anthropic.com/settings/keys</p>
                        </div>

                        {/* DeepSeek */}
                        <div>
                            <label className="block mb-1.5 text-sm font-medium text-gray-300 flex items-center gap-2">
                                <span className="inline-block w-2 h-2 rounded-full bg-blue-400" /> DeepSeek API Key
                            </label>
                            <input
                                name="deepseekApiKey"
                                type="password"
                                defaultValue={providerApiKeys.deepseek}
                                placeholder="sk-..."
                                className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none font-mono text-sm"
                            />
                            <p className="text-xs text-gray-600 mt-1">Get your key at platform.deepseek.com</p>
                        </div>

                        {/* Qwen */}
                        <div>
                            <label className="block mb-1.5 text-sm font-medium text-gray-300 flex items-center gap-2">
                                <span className="inline-block w-2 h-2 rounded-full bg-teal-400" /> Qwen (DashScope) API Key
                            </label>
                            <input
                                name="qwenApiKey"
                                type="password"
                                defaultValue={providerApiKeys.qwen}
                                placeholder="sk-..."
                                className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none font-mono text-sm"
                            />
                            <p className="text-xs text-gray-600 mt-1">Get your key at dashscope.aliyun.com</p>
                        </div>
                    </div>
                    <div className="flex justify-end pt-1">
                        <button
                            type="submit"
                            disabled={providerPending}
                            className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
                        >
                            {providerPending ? "Saving..." : "Save Provider Keys"}
                        </button>
                    </div>
                </form>
            </div>

            {/* Row 5 — Cohere Reranking */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-gray-800">
                    <h2 className="font-semibold flex items-center gap-2">
                        <Layers size={18} className="text-purple-400" /> Cohere Reranking
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Improve knowledge base answer quality by reranking vector search results with a cross-encoder.
                        When enabled, the system fetches 20 candidates and reranks to the top 5 using{" "}
                        <span className="text-gray-400">rerank-v3.5</span>. Get a key at{" "}
                        <span className="text-gray-400">dashboard.cohere.com</span>.
                    </p>
                </div>
                <form action={cohereFormAction} className="p-5 space-y-4">
                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                        <label htmlFor="cohere-enabled" className="text-sm font-medium text-gray-300 cursor-pointer select-none flex-1">
                            Enable Cohere reranking for knowledge base queries
                        </label>
                        <div className="flex items-center gap-2.5 shrink-0">
                            {cohere.enabled && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-medium">ON</span>
                            )}
                            <Toggle name="cohereEnabled" id="cohere-enabled" defaultChecked={cohere.enabled} />
                        </div>
                    </div>
                    <div>
                        <label className="block mb-1.5 text-sm font-medium text-gray-300">Cohere API Key</label>
                        <input
                            name="cohereApiKey"
                            type="password"
                            defaultValue={cohere.apiKey}
                            placeholder="••••••••••••••••••••••••••••••••••••••••"
                            className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-mono text-sm"
                        />
                        <p className="text-xs text-gray-600 mt-1">Required when reranking is enabled. The free tier supports 1 000 rerank calls/month.</p>
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={coherePending}
                            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
                        >
                            {coherePending ? "Saving..." : "Save Cohere Settings"}
                        </button>
                    </div>
                </form>
            </div>

            {/* Row 6 — Google Drive Connector */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-gray-800">
                    <h2 className="font-semibold flex items-center gap-2">
                        <HardDrive size={18} className="text-blue-400" /> Google Drive Connector
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Let users live-sync Google Drive files into their knowledge bases. Create an OAuth
                        2.0 Client (type <span className="text-gray-400">Web application</span>) in Google
                        Cloud Console, enable the <span className="text-gray-400">Google Drive API</span>, and
                        add <span className="text-gray-400 font-mono text-xs">{`<your-domain>/api/connectors/google/callback`}</span>{" "}
                        as an authorized redirect URI. This is separate from Google login above.
                    </p>
                </div>
                <form action={connectorFormAction} className="p-5 space-y-4">
                    <div>
                        <label className="block mb-1.5 text-sm font-medium text-gray-300">Client ID</label>
                        <input
                            name="connectorGoogleClientId"
                            type="text"
                            defaultValue={connectorGoogle.clientId}
                            placeholder="xxxxxxxx.apps.googleusercontent.com"
                            className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                        />
                    </div>
                    <div>
                        <label className="block mb-1.5 text-sm font-medium text-gray-300">Client Secret</label>
                        <input
                            name="connectorGoogleClientSecret"
                            type="password"
                            defaultValue={connectorGoogle.clientSecret}
                            placeholder="••••••••••••••••••••••••••••••••••••••••"
                            className="w-full p-3 bg-gray-950 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                        />
                        <p className="text-xs text-gray-600 mt-1">Requested scope: <span className="font-mono">drive.readonly</span> (read-only). Tokens are stored encrypted.</p>
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={connectorPending}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
                        >
                            {connectorPending ? "Saving..." : "Save Connector Settings"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
