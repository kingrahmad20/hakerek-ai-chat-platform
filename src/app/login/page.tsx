import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AuthForm from "@/components/auth/auth-form";

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ mode?: string; callbackUrl?: string; verified?: string; reset?: string }>;
}) {
    const session = await getServerSession(authOptions);
    if (session) redirect("/");

    const params = await searchParams;

    const [settings, termsPage, privacyPage, userCount] = await Promise.all([
        prisma.setting.findMany({
            where: { key: { in: ["turnstileEnabled", "turnstileSiteKey", "googleEnabled", "oidcEnabled", "oidcName"] } },
        }),
        prisma.page.findFirst({ where: { slug: "terms-of-service", published: true }, select: { slug: true } }),
        prisma.page.findFirst({ where: { slug: "privacy-policy", published: true }, select: { slug: true } }),
        prisma.user.count(),
    ]);
    const get = (k: string) => settings.find(s => s.key === k)?.value || "";

    // First-run setup: no users exist yet, so force the admin registration flow.
    const setup = userCount === 0;

    return (
        <AuthForm
            initialMode={setup || params.mode === "register" ? "register" : "login"}
            callbackUrl={params.callbackUrl || "/"}
            turnstile={{ enabled: get("turnstileEnabled") === "true", siteKey: get("turnstileSiteKey") }}
            googleEnabled={!setup && get("googleEnabled") === "true"}
            ssoEnabled={!setup && get("oidcEnabled") === "true"}
            ssoName={get("oidcName") || "SSO"}
            verified={params.verified === "1"}
            resetSuccess={params.reset === "1"}
            termsSlug={termsPage?.slug}
            privacySlug={privacyPage?.slug}
            setup={setup}
        />
    );
}
