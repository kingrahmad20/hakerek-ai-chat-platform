import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import type { PlatformRole } from "@/types";

// Constant-cost hash compared against when an account does not exist, so the
// response time of a login attempt does not reveal whether the email is valid.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("unused-placeholder-password", 12);

const credentialsProvider = CredentialsProvider({
    name: "Credentials",
    credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        turnstileToken: { label: "Turnstile", type: "text" },
    },
    async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).toLowerCase();

        // Brute-force protection: cap attempts per account and per source IP.
        // Runs before any DB/hash work so it also throttles enumeration probes.
        const xff = req?.headers?.["x-forwarded-for"];
        const ip = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() || "unknown";
        if (!await rateLimit(`login:email:${email}`, 10, 15 * 60 * 1000)) {
            logger.warn("auth_rate_limited", { scope: "email", email });
            return null;
        }
        if (ip !== "unknown" && !await rateLimit(`login:ip:${ip}`, 50, 15 * 60 * 1000)) {
            logger.warn("auth_rate_limited", { scope: "ip", ip });
            return null;
        }

        const settings = await prisma.setting.findMany({
            where: { key: { in: ["turnstileEnabled", "turnstileSecretKey", "emailVerificationRequired"] } },
        });
        const getSetting = (key: string) => settings.find(s => s.key === key)?.value;

        if (getSetting("turnstileEnabled") === "true") {
            const secretKey = getSetting("turnstileSecretKey") || "";
            const ok = await verifyTurnstile(credentials.turnstileToken || "", secretKey);
            if (!ok) {
                logger.warn("auth_turnstile_failed", { email: credentials.email });
                return null;
            }
        }

        const user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
        });

        if (!user?.password) {
            // Equalize timing with the real bcrypt path to avoid user enumeration.
            await bcrypt.compare(credentials.password as string, DUMMY_PASSWORD_HASH);
            return null;
        }
        if (user.banned) {
            logger.warn("auth_banned_login", { userId: user.id });
            return null;
        }

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) {
            logger.warn("auth_invalid_password", { email: credentials.email });
            return null;
        }

        if (getSetting("emailVerificationRequired") === "true" && !user.emailVerified) {
            logger.warn("auth_email_not_verified", { userId: user.id });
            return null;
        }

        logger.info("auth_login_success", { userId: user.id });
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role as PlatformRole,
        };
    },
});

export const authOptions: NextAuthOptions = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapter: PrismaAdapter(prisma) as any,
    providers: [credentialsProvider],
    session: { strategy: "jwt" },
    callbacks: {
        async signIn({ user, account }) {
            if (account?.provider === "credentials") return true;
            if (!user.id) return true;
            const dbUser = await prisma.user.findUnique({
                where: { id: user.id },
                select: { banned: true },
            });
            return !dbUser?.banned;
        },
        async jwt({ token, user }) {
            if (user) {
                if (!user.id) return token;
                token.id = user.id;
                const dbUser = await prisma.user.findUnique({
                    where: { id: user.id },
                    select: { role: true, tokenVersion: true },
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                token.role = ((user as any).role ?? dbUser?.role ?? "USER") as PlatformRole;
                token.tokenVersion = dbUser?.tokenVersion ?? 0;
                token.checkedAt = Math.floor(Date.now() / 1000);
            } else {
                // Migrate tokens issued before token.id was added (fall back to token.sub)
                if (!token.id && token.sub) token.id = token.sub;

                if (token.id) {
                    const now = Math.floor(Date.now() / 1000);
                    if (now - ((token.checkedAt as number) ?? 0) > 60) {
                        const dbUser = await prisma.user.findUnique({
                            where: { id: token.id as string },
                            select: { banned: true, tokenVersion: true },
                        });
                        if (!dbUser || dbUser.banned || (dbUser.tokenVersion ?? 0) !== (token.tokenVersion as number ?? 0)) {
                            throw new Error("SessionInvalidated");
                        }
                        token.checkedAt = now;
                    }
                }
            }
            return token;
        },
        async session({ session, token }) {
            if (token?.id && session.user) {
                session.user.id = token.id;
                session.user.role = token.role;
            }
            return session;
        },
    },
};

export async function buildAuthOptions(): Promise<NextAuthOptions> {
    const settings = await prisma.setting.findMany({
        where: {
            key: {
                in: [
                    "googleClientId", "googleClientSecret", "googleEnabled",
                    "oidcEnabled", "oidcName", "oidcIssuer", "oidcClientId", "oidcClientSecret",
                ],
            },
        },
    });
    const get = (k: string) => settings.find((s) => s.key === k)?.value || "";

    const providers: NextAuthOptions["providers"] = [credentialsProvider];
    if (get("googleEnabled") === "true" && get("googleClientId") && get("googleClientSecret")) {
        providers.push(
            GoogleProvider({
                clientId: get("googleClientId"),
                clientSecret: get("googleClientSecret"),
            })
        );
    }

    // Generic OpenID Connect SSO (Okta, Entra ID, Auth0, Google Workspace, …),
    // configured org-wide in the admin dashboard. New users are JIT-provisioned
    // via the Prisma adapter, same as Google.
    const oidcIssuer = get("oidcIssuer");
    if (get("oidcEnabled") === "true" && oidcIssuer && get("oidcClientId") && get("oidcClientSecret")) {
        providers.push({
            id: "oidc",
            name: get("oidcName") || "SSO",
            type: "oauth",
            wellKnown: `${oidcIssuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
            authorization: { params: { scope: "openid email profile" } },
            idToken: true,
            checks: ["pkce", "state"],
            clientId: get("oidcClientId"),
            clientSecret: get("oidcClientSecret"),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            profile(profile: any) {
                // `role` is required by the augmented next-auth User type; the
                // Prisma adapter ignores it on create, so the DB default "USER"
                // still applies to JIT-provisioned accounts.
                return {
                    id: profile.sub,
                    name: profile.name ?? profile.preferred_username ?? null,
                    email: profile.email,
                    image: profile.picture ?? null,
                    role: "USER" as PlatformRole,
                };
            },
        });
    }

    return { ...authOptions, providers };
}
