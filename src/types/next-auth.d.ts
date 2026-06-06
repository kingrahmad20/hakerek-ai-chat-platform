import "next-auth";
import "next-auth/jwt";
import type { PlatformRole } from "./index";

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
            role: PlatformRole;
        };
    }
    interface User {
        role: PlatformRole;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string;
        role: PlatformRole;
    }
}
