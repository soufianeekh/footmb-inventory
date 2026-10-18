import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/lib/users";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string; role: UserRole; storeKeys: string[] };
  }
  interface User { role: UserRole; storeKeys: string[] }
}

declare module "next-auth/jwt" {
  interface JWT { role?: UserRole; userId?: string; storeKeys?: string[]; sessionStartedAt?: number }
}
