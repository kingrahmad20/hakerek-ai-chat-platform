"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";

function PresenceBeacon() {
    const { data: session } = useSession();

    useEffect(() => {
        if (!session?.user?.id) return;

        const send = () => fetch("/api/presence/heartbeat", { method: "POST" }).catch(() => {});
        send();
        const id = setInterval(send, 60_000);
        return () => clearInterval(id);
    }, [session?.user?.id]);

    return null;
}

export default function NextAuthSessionProvider({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <PresenceBeacon />
            {children}
        </SessionProvider>
    );
}
