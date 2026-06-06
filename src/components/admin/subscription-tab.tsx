"use client";
import { useState } from "react";
import { CreditCard, Plus, Trash2, Save, ToggleLeft, ToggleRight, Check, X } from "lucide-react";

interface SubscriptionPlan {
    id: string;
    name: string;
    displayName: string;
    stripePriceId: string | null;
    monthlyPrice: number;
    features: string[];
    messageLimit: number | null;
    tokenLimit: number | null;
    sortOrder: number;
    active: boolean;
}

interface SubscriptionTabProps {
    subscriptionEnabled: boolean;
    stripePublishableKey: string;
    stripeSecretKey: string;
    stripeWebhookSecret: string;
    plans: SubscriptionPlan[];
}

function PlanCard({
    plan,
    onSave,
    onDelete,
}: {
    plan: SubscriptionPlan;
    onSave: (plan: SubscriptionPlan) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [local, setLocal] = useState<SubscriptionPlan>({ ...plan });
    const [featureInput, setFeatureInput] = useState("");

    const handleSave = async () => {
        setSaving(true);
        await onSave(local);
        setSaving(false);
        setEditing(false);
    };

    const handleCancel = () => {
        setLocal({ ...plan });
        setEditing(false);
    };

    const addFeature = () => {
        if (!featureInput.trim()) return;
        setLocal(p => ({ ...p, features: [...p.features, featureInput.trim()] }));
        setFeatureInput("");
    };

    const removeFeature = (i: number) => {
        setLocal(p => ({ ...p, features: p.features.filter((_, idx) => idx !== i) }));
    };

    const planColor =
        local.name === "free" ? "from-gray-500 to-gray-600" :
        local.name === "pro" ? "from-blue-500 to-blue-600" :
        "from-purple-500 to-purple-600";

    return (
        <div className={`bg-gray-800 rounded-xl border ${local.active ? "border-gray-700" : "border-gray-700/40 opacity-60"}`}>
            <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${planColor} flex items-center justify-center shrink-0`}>
                            <CreditCard size={18} className="text-white" />
                        </div>
                        <div>
                            {editing ? (
                                <input
                                    value={local.displayName}
                                    onChange={e => setLocal(p => ({ ...p, displayName: e.target.value }))}
                                    className="text-base font-semibold bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-white w-full"
                                />
                            ) : (
                                <h3 className="text-base font-semibold text-white">{local.displayName}</h3>
                            )}
                            <p className="text-xs text-gray-500 capitalize">{local.name} plan</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => setLocal(p => ({ ...p, active: !p.active }))}
                            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                                local.active
                                    ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                                    : "bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600"
                            }`}
                            title={local.active ? "Disable plan" : "Enable plan"}
                        >
                            {local.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                            {local.active ? "Active" : "Inactive"}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Monthly Price (USD)</label>
                        {editing ? (
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={local.monthlyPrice}
                                onChange={e => setLocal(p => ({ ...p, monthlyPrice: parseFloat(e.target.value) || 0 }))}
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
                            />
                        ) : (
                            <p className="text-sm font-medium text-white">
                                {local.monthlyPrice === 0 ? "Free" : `$${local.monthlyPrice.toFixed(2)}/mo`}
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Stripe Price ID</label>
                        {editing ? (
                            <input
                                value={local.stripePriceId || ""}
                                onChange={e => setLocal(p => ({ ...p, stripePriceId: e.target.value || null }))}
                                placeholder="price_xxx"
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
                            />
                        ) : (
                            <p className="text-sm text-gray-400 font-mono truncate">
                                {local.stripePriceId || <span className="text-gray-600 italic">not set</span>}
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Message Limit / Month</label>
                        {editing ? (
                            <input
                                type="number"
                                min="0"
                                value={local.messageLimit ?? ""}
                                onChange={e => setLocal(p => ({ ...p, messageLimit: e.target.value ? parseInt(e.target.value) : null }))}
                                placeholder="Unlimited"
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
                            />
                        ) : (
                            <p className="text-sm text-white">{local.messageLimit ?? <span className="text-gray-400">Unlimited</span>}</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Token Limit / Month</label>
                        {editing ? (
                            <input
                                type="number"
                                min="0"
                                value={local.tokenLimit ?? ""}
                                onChange={e => setLocal(p => ({ ...p, tokenLimit: e.target.value ? parseInt(e.target.value) : null }))}
                                placeholder="Unlimited"
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
                            />
                        ) : (
                            <p className="text-sm text-white">{local.tokenLimit?.toLocaleString() ?? <span className="text-gray-400">Unlimited</span>}</p>
                        )}
                    </div>
                </div>

                <div className="mb-4">
                    <label className="block text-xs text-gray-500 mb-2">Features</label>
                    <div className="space-y-1.5">
                        {local.features.map((f, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <Check size={12} className="text-green-400 shrink-0" />
                                <span className="flex-1 text-sm text-gray-300">{f}</span>
                                {editing && (
                                    <button onClick={() => removeFeature(i)} className="text-gray-600 hover:text-red-400 transition-colors">
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        ))}
                        {editing && (
                            <div className="flex gap-2 mt-2">
                                <input
                                    value={featureInput}
                                    onChange={e => setFeatureInput(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && addFeature()}
                                    placeholder="Add feature..."
                                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600"
                                />
                                <button
                                    onClick={addFeature}
                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-gray-700">
                    {editing ? (
                        <>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
                            >
                                <Save size={13} /> {saving ? "Saving..." : "Save"}
                            </button>
                            <button
                                onClick={handleCancel}
                                className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setEditing(true)}
                            className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            Edit Plan
                        </button>
                    )}
                    {local.name !== "free" && (
                        <button
                            onClick={() => onDelete(plan.id)}
                            className="ml-auto text-gray-600 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-gray-700"
                            title="Delete plan"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export function SubscriptionTab({
    subscriptionEnabled: initialEnabled,
    stripePublishableKey: initialPubKey,
    stripeSecretKey: initialSecKey,
    stripeWebhookSecret: initialWebhookSecret,
    plans: initialPlans,
}: SubscriptionTabProps) {
    const [enabled, setEnabled] = useState(initialEnabled);
    const [pubKey, setPubKey] = useState(initialPubKey);
    const [secKey, setSecKey] = useState(initialSecKey);
    const [webhookSecret, setWebhookSecret] = useState(initialWebhookSecret);
    const [plans, setPlans] = useState<SubscriptionPlan[]>(initialPlans);
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [showSecretKey, setShowSecretKey] = useState(false);
    const [showWebhookSecret, setShowWebhookSecret] = useState(false);
    const [showNewPlan, setShowNewPlan] = useState(false);
    const [newPlanName, setNewPlanName] = useState("");
    const [creatingPlan, setCreatingPlan] = useState(false);
    const [newPlanError, setNewPlanError] = useState<string | null>(null);

    const saveSettings = async () => {
        setSavingSettings(true);
        setSettingsMsg(null);
        try {
            const res = await fetch("/api/admin/subscription", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "saveSettings",
                    subscriptionEnabled: enabled,
                    stripePublishableKey: pubKey,
                    stripeSecretKey: secKey,
                    stripeWebhookSecret: webhookSecret,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            setSettingsMsg({ type: "success", text: "Settings saved." });
        } catch (e) {
            setSettingsMsg({ type: "error", text: e instanceof Error ? e.message : "Failed to save." });
        } finally {
            setSavingSettings(false);
        }
    };

    const savePlan = async (plan: SubscriptionPlan) => {
        const res = await fetch("/api/admin/subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "savePlan", plan }),
        });
        if (!res.ok) throw new Error(await res.text());
        const updated: SubscriptionPlan = await res.json();
        setPlans(ps => ps.map(p => p.id === updated.id ? { ...updated, features: updated.features } : p));
    };

    const deletePlan = async (id: string) => {
        if (!confirm("Delete this plan? Users on it will be moved to Free.")) return;
        const res = await fetch("/api/admin/subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "deletePlan", id }),
        });
        if (res.ok) setPlans(ps => ps.filter(p => p.id !== id));
    };

    const openNewPlan = () => {
        setNewPlanName("");
        setNewPlanError(null);
        setShowNewPlan(true);
    };

    const createPlan = async () => {
        const name = newPlanName.trim();
        if (!name) {
            setNewPlanError("Plan key is required.");
            return;
        }
        setCreatingPlan(true);
        setNewPlanError(null);
        try {
            const res = await fetch("/api/admin/subscription", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "createPlan",
                    name: name.toLowerCase(),
                    displayName: name.charAt(0).toUpperCase() + name.slice(1),
                }),
            });
            if (!res.ok) throw new Error(await res.text() || "Failed to create plan.");
            const newPlan: SubscriptionPlan = await res.json();
            setPlans(ps => [...ps, { ...newPlan, features: newPlan.features }]);
            setShowNewPlan(false);
        } catch (e) {
            setNewPlanError(e instanceof Error ? e.message : "Failed to create plan.");
        } finally {
            setCreatingPlan(false);
        }
    };

    return (
        <div className="space-y-8 max-w-4xl">
            {/* Enable/Disable toggle */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h3 className="text-base font-semibold text-white">Subscription Payments</h3>
                        <p className="text-sm text-gray-400 mt-0.5">
                            Show or hide the Subscription option in the user menu. When disabled, users cannot access subscription plans.
                        </p>
                    </div>
                    <button
                        onClick={() => setEnabled(v => !v)}
                        className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                            enabled
                                ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                                : "bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600"
                        }`}
                    >
                        {enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        {enabled ? "Enabled" : "Disabled"}
                    </button>
                </div>
            </div>

            {/* Stripe API Keys */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4">
                <h3 className="text-base font-semibold text-white">Stripe API Keys</h3>

                <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Publishable Key</label>
                    <input
                        value={pubKey}
                        onChange={e => setPubKey(e.target.value)}
                        placeholder="pk_live_... or pk_test_..."
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 font-mono"
                    />
                </div>

                <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Secret Key</label>
                    <div className="relative">
                        <input
                            type={showSecretKey ? "text" : "password"}
                            value={secKey}
                            onChange={e => setSecKey(e.target.value)}
                            placeholder="sk_live_... or sk_test_..."
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder-gray-600 font-mono"
                        />
                        <button
                            type="button"
                            onClick={() => setShowSecretKey(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
                        >
                            {showSecretKey ? "Hide" : "Show"}
                        </button>
                    </div>
                </div>

                <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Webhook Signing Secret</label>
                    <div className="relative">
                        <input
                            type={showWebhookSecret ? "text" : "password"}
                            value={webhookSecret}
                            onChange={e => setWebhookSecret(e.target.value)}
                            placeholder="whsec_..."
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder-gray-600 font-mono"
                        />
                        <button
                            type="button"
                            onClick={() => setShowWebhookSecret(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
                        >
                            {showWebhookSecret ? "Hide" : "Show"}
                        </button>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                        Set webhook endpoint in Stripe dashboard: <span className="font-mono">/api/stripe/webhook</span>
                    </p>
                </div>

                <div className="flex items-center gap-3 pt-1">
                    <button
                        onClick={saveSettings}
                        disabled={savingSettings}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-colors"
                    >
                        <Save size={14} /> {savingSettings ? "Saving..." : "Save Settings"}
                    </button>
                    {settingsMsg && (
                        <span className={`text-sm ${settingsMsg.type === "success" ? "text-green-400" : "text-red-400"}`}>
                            {settingsMsg.text}
                        </span>
                    )}
                </div>
            </div>

            {/* Plans */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-white">Subscription Plans</h3>
                    <button
                        onClick={openNewPlan}
                        className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors"
                    >
                        <Plus size={14} /> New Plan
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[...plans].sort((a, b) => a.sortOrder - b.sortOrder).map(plan => (
                        <PlanCard
                            key={plan.id}
                            plan={plan}
                            onSave={savePlan}
                            onDelete={deletePlan}
                        />
                    ))}
                </div>
            </div>

            {/* New Plan modal */}
            {showNewPlan && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    onClick={() => !creatingPlan && setShowNewPlan(false)}
                >
                    <div
                        className="w-full max-w-sm bg-gray-800 rounded-xl border border-gray-700 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
                            <h3 className="text-base font-semibold text-white">New Plan</h3>
                            <button
                                onClick={() => setShowNewPlan(false)}
                                disabled={creatingPlan}
                                className="text-gray-500 hover:text-white disabled:opacity-50 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 space-y-2">
                            <label className="block text-xs text-gray-500">Plan key</label>
                            <input
                                autoFocus
                                value={newPlanName}
                                onChange={e => { setNewPlanName(e.target.value); setNewPlanError(null); }}
                                onKeyDown={e => {
                                    if (e.key === "Enter") createPlan();
                                    if (e.key === "Escape" && !creatingPlan) setShowNewPlan(false);
                                }}
                                placeholder="e.g. enterprise"
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600"
                            />
                            <p className="text-xs text-gray-600">
                                A short lowercase identifier. You can edit the display name, price, and limits after creating.
                            </p>
                            {newPlanError && <p className="text-sm text-red-400">{newPlanError}</p>}
                        </div>
                        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-700">
                            <button
                                onClick={() => setShowNewPlan(false)}
                                disabled={creatingPlan}
                                className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-50 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createPlan}
                                disabled={creatingPlan}
                                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-colors"
                            >
                                <Plus size={14} /> {creatingPlan ? "Creating..." : "Create Plan"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
