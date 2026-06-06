"use client";
import { useState } from "react";
import { Check, CreditCard, ArrowLeft, Zap, Crown, Star, ExternalLink } from "lucide-react";
import Link from "next/link";

interface Plan {
    id: string;
    name: string;
    displayName: string;
    stripePriceId: string | null;
    monthlyPrice: number;
    features: string[];
    messageLimit: number | null;
    tokenLimit: number | null;
    active: boolean;
}

interface Subscription {
    id: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    stripeCustomerId: string | null;
}

interface Props {
    plans: Plan[];
    activePlan: Plan | null;
    subscription: Subscription | null;
    stripePublishableKey: string;
    appName: string;
    flash: "success" | "canceled" | null;
}

function planIcon(name: string) {
    if (name === "pro") return <Zap size={22} className="text-blue-400" />;
    if (name === "ultra") return <Crown size={22} className="text-purple-400" />;
    return <Star size={22} className="text-gray-400" />;
}

function planGradient(name: string) {
    if (name === "pro") return "from-blue-500/20 to-blue-600/5 border-blue-500/30";
    if (name === "ultra") return "from-purple-500/20 to-purple-600/5 border-purple-500/30";
    return "from-gray-700/40 to-gray-800/20 border-gray-700/50";
}

function planBadgeColor(name: string) {
    if (name === "pro") return "bg-blue-500/20 text-blue-300 border border-blue-500/30";
    if (name === "ultra") return "bg-purple-500/20 text-purple-300 border border-purple-500/30";
    return "bg-gray-700/60 text-gray-400 border border-gray-600/40";
}

export function SubscriptionPageClient({ plans, activePlan, subscription, appName, flash }: Props) {
    const [loading, setLoading] = useState<string | null>(null);
    const [portalLoading, setPortalLoading] = useState(false);

    const handleUpgrade = async (plan: Plan) => {
        if (!plan.stripePriceId) return;
        setLoading(plan.id);
        try {
            const res = await fetch("/api/subscription/create-checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planId: plan.id }),
            });
            const data = await res.json();
            if (data.url) window.location.href = data.url;
        } finally {
            setLoading(null);
        }
    };

    const handleManage = async () => {
        setPortalLoading(true);
        try {
            const res = await fetch("/api/subscription/portal", { method: "POST" });
            const data = await res.json();
            if (data.url) window.location.href = data.url;
        } finally {
            setPortalLoading(false);
        }
    };

    const isCurrentPlan = (plan: Plan) => activePlan?.id === plan.id;

    const statusBadge = (status: string) => {
        const map: Record<string, string> = {
            active: "bg-green-500/20 text-green-300 border-green-500/30",
            trialing: "bg-blue-500/20 text-blue-300 border-blue-500/30",
            past_due: "bg-red-500/20 text-red-300 border-red-500/30",
            canceled: "bg-gray-700 text-gray-400 border-gray-600",
            incomplete: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
        };
        return map[status] || "bg-gray-700 text-gray-400 border-gray-600";
    };

    return (
        <div className="min-h-dvh bg-gray-950 text-white">
            <div className="max-w-5xl mx-auto px-4 py-10">
                {/* Header */}
                <div className="mb-8">
                    <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors mb-6">
                        <ArrowLeft size={14} /> Back to {appName}
                    </Link>
                    <h1 className="text-3xl font-bold text-white">Subscription</h1>
                    <p className="text-gray-400 mt-1">Manage your plan and billing</p>
                </div>

                {/* Flash messages */}
                {flash === "success" && (
                    <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-300 text-sm flex items-center gap-2">
                        <Check size={16} /> Subscription activated successfully! Welcome aboard.
                    </div>
                )}
                {flash === "canceled" && (
                    <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-300 text-sm">
                        Checkout was canceled. Your plan was not changed.
                    </div>
                )}

                {/* Current plan banner */}
                {activePlan && (
                    <div className="mb-8 p-5 bg-gray-800/60 border border-gray-700/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-700 flex items-center justify-center shrink-0">
                                {planIcon(activePlan.name)}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-white">{activePlan.displayName}</span>
                                    {subscription && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${statusBadge(subscription.status)}`}>
                                            {subscription.status}
                                        </span>
                                    )}
                                    {subscription?.cancelAtPeriodEnd && (
                                        <span className="text-xs px-2 py-0.5 rounded-full border bg-orange-500/20 text-orange-300 border-orange-500/30">
                                            Cancels soon
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-400 mt-0.5">
                                    {activePlan.monthlyPrice === 0
                                        ? "Free plan"
                                        : `$${activePlan.monthlyPrice.toFixed(2)}/month`}
                                    {subscription?.currentPeriodEnd && (
                                        <> &middot; Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</>
                                    )}
                                </p>
                            </div>
                        </div>
                        {subscription?.stripeCustomerId && (
                            <button
                                onClick={handleManage}
                                disabled={portalLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-xl text-sm text-white transition-colors shrink-0"
                            >
                                <ExternalLink size={14} />
                                {portalLoading ? "Opening..." : "Manage Billing"}
                            </button>
                        )}
                    </div>
                )}

                {/* Plans grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {plans.map(plan => (
                        <div
                            key={plan.id}
                            className={`relative rounded-2xl border bg-gradient-to-br p-6 flex flex-col ${planGradient(plan.name)} ${
                                isCurrentPlan(plan) ? "ring-2 ring-blue-500/40" : ""
                            }`}
                        >
                            {isCurrentPlan(plan) && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className="bg-blue-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                                        Current Plan
                                    </span>
                                </div>
                            )}
                            {plan.name === "ultra" && !isCurrentPlan(plan) && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className="bg-purple-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                                        Most Powerful
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center gap-3 mb-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${planBadgeColor(plan.name)}`}>
                                    {planIcon(plan.name)}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-white">{plan.displayName}</h3>
                                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${planBadgeColor(plan.name)}`}>
                                        {plan.name}
                                    </span>
                                </div>
                            </div>

                            <div className="mb-5">
                                {plan.monthlyPrice === 0 ? (
                                    <span className="text-3xl font-bold text-white">Free</span>
                                ) : (
                                    <>
                                        <span className="text-3xl font-bold text-white">${plan.monthlyPrice.toFixed(0)}</span>
                                        <span className="text-gray-400 text-sm">/month</span>
                                    </>
                                )}
                            </div>

                            <div className="space-y-2 mb-6 flex-1">
                                {plan.messageLimit !== null && (
                                    <div className="flex items-center gap-2 text-sm text-gray-300">
                                        <Check size={13} className="text-green-400 shrink-0" />
                                        {plan.messageLimit.toLocaleString()} messages / month
                                    </div>
                                )}
                                {plan.tokenLimit !== null && (
                                    <div className="flex items-center gap-2 text-sm text-gray-300">
                                        <Check size={13} className="text-green-400 shrink-0" />
                                        {plan.tokenLimit.toLocaleString()} tokens / month
                                    </div>
                                )}
                                {plan.messageLimit === null && (
                                    <div className="flex items-center gap-2 text-sm text-gray-300">
                                        <Check size={13} className="text-green-400 shrink-0" />
                                        Unlimited messages
                                    </div>
                                )}
                                {plan.features.map((f: string, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-sm text-gray-300">
                                        <Check size={13} className="text-green-400 shrink-0" />
                                        {f}
                                    </div>
                                ))}
                            </div>

                            {isCurrentPlan(plan) ? (
                                <div className="w-full py-2.5 rounded-xl text-sm text-center font-medium bg-gray-700/60 text-gray-400 border border-gray-600/40">
                                    Current Plan
                                </div>
                            ) : plan.monthlyPrice === 0 ? (
                                <div className="w-full py-2.5 rounded-xl text-sm text-center font-medium bg-gray-700/60 text-gray-400 border border-gray-600/40">
                                    Free — Always included
                                </div>
                            ) : plan.stripePriceId ? (
                                <button
                                    onClick={() => handleUpgrade(plan)}
                                    disabled={loading === plan.id}
                                    className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                        plan.name === "ultra"
                                            ? "bg-purple-600 hover:bg-purple-700 text-white"
                                            : "bg-blue-600 hover:bg-blue-700 text-white"
                                    } disabled:opacity-50`}
                                >
                                    <CreditCard size={14} />
                                    {loading === plan.id ? "Redirecting..." : `Upgrade to ${plan.displayName}`}
                                </button>
                            ) : (
                                <div className="w-full py-2.5 rounded-xl text-sm text-center font-medium bg-gray-700/60 text-gray-500 border border-gray-600/40">
                                    Coming soon
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <p className="text-center text-xs text-gray-600 mt-8">
                    Payments are processed securely by Stripe. You can cancel at any time from the billing portal.
                </p>
            </div>
        </div>
    );
}
