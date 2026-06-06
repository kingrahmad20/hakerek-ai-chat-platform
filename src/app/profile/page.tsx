import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ProfileForm from "@/components/profile/profile-form";
import { isValidLocale, DEFAULT_LOCALE } from "@/i18n/translations";

export default async function ProfilePage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/login");

    const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { systemPrompt: true, image: true, locale: true },
    });

    const locale = isValidLocale(dbUser?.locale) ? dbUser!.locale : DEFAULT_LOCALE;

    return (
        <ProfileForm
            user={{
                id: session.user.id,
                name: session.user.name ?? null,
                email: session.user.email ?? null,
                image: dbUser?.image ?? null,
                systemPrompt: dbUser?.systemPrompt ?? null,
                locale,
            }}
        />
    );
}
