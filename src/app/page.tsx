import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ChatInterface from "@/components/chat/chat-interface";

export default async function Home() {
    const session = await getServerSession(authOptions);

    // First-run setup: with no users yet, send visitors to create the admin account.
    if (!session?.user?.id && (await prisma.user.count()) === 0) {
        redirect("/login");
    }

    const [dbUser, allowFileUploadSetting, appNameSetting, subscriptionEnabledSetting, templatesSetting, slashCommandsSetting, personasSetting, libraryItems] = await Promise.all([
        session?.user?.id
            ? prisma.user.findUnique({ where: { id: session.user.id }, select: { image: true } })
            : Promise.resolve(null),
        prisma.setting.findUnique({ where: { key: "allowFileUpload" } }),
        prisma.setting.findUnique({ where: { key: "appName" } }),
        prisma.setting.findUnique({ where: { key: "subscriptionEnabled" } }),
        prisma.setting.findUnique({ where: { key: "conversationTemplates" } }),
        prisma.setting.findUnique({ where: { key: "slashCommands" } }),
        prisma.setting.findUnique({ where: { key: "personas" } }),
        session?.user?.id
            ? prisma.userLibraryItem.findMany({ where: { userId: session.user.id, enabled: true } })
            : Promise.resolve([]),
    ]);

    const allowFileUpload = allowFileUploadSetting?.value === "true";
    const appName = appNameSetting?.value || "Hakerek";
    const subscriptionEnabled = subscriptionEnabledSetting?.value === "true";
    const conversationTemplates: { id: string; name: string; prompt: string; enabled: boolean }[] =
        templatesSetting?.value ? (() => { try { return JSON.parse(templatesSetting.value); } catch { return []; } })() : [];
    const allSlashCommands: { id: string; command: string; description: string; prompt: string; enabled: boolean }[] =
        slashCommandsSetting?.value ? (() => { try { return JSON.parse(slashCommandsSetting.value); } catch { return []; } })() : [];
    const allPersonas: { id: string; name: string; description: string; systemPrompt: string; enabled: boolean }[] =
        personasSetting?.value ? (() => { try { return JSON.parse(personasSetting.value); } catch { return []; } })() : [];

    // Merge the signed-in user's own library personas / slash commands (created on
    // /library or imported from the marketplace) with the global admin-curated ones.
    const userPersonas: typeof allPersonas = [];
    const userSlashCommands: typeof allSlashCommands = [];
    for (const item of libraryItems) {
        try {
            const data = JSON.parse(item.data);
            if (item.type === "persona") {
                userPersonas.push({ id: item.id, name: data.name, description: data.description ?? "", systemPrompt: data.systemPrompt, enabled: true });
            } else if (item.type === "slash_command") {
                userSlashCommands.push({ id: item.id, command: data.command, description: data.description ?? "", prompt: data.prompt, enabled: true });
            }
        } catch { /* skip malformed */ }
    }

    const enabledTemplates = conversationTemplates.filter(t => t.enabled);
    const enabledSlashCommands = [...allSlashCommands.filter(c => c.enabled), ...userSlashCommands];
    const enabledPersonas = [...allPersonas.filter(p => p.enabled), ...userPersonas];

    if (!session?.user?.id) return <ChatInterface user={null} allowFileUpload={allowFileUpload} appName={appName} subscriptionEnabled={subscriptionEnabled} conversationTemplates={enabledTemplates} slashCommands={enabledSlashCommands} personas={enabledPersonas} />;

    return (
        <ChatInterface
            user={{
                id: session.user.id,
                name: session.user.name ?? null,
                email: session.user.email ?? null,
                image: dbUser?.image ?? null,
                role: session.user.role,
            }}
            allowFileUpload={allowFileUpload}
            appName={appName}
            subscriptionEnabled={subscriptionEnabled}
            conversationTemplates={enabledTemplates}
            slashCommands={enabledSlashCommands}
            personas={enabledPersonas}
        />
    );
}
