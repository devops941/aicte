import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      regionId: string | null;
      institutionId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
    regionId?: string | null;
    institutionId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: string;
    regionId?: string | null;
    institutionId?: string | null;
  }
}
