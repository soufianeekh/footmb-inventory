"use client";
import { createContext, useContext } from "react";
import type { UserRole } from "@/lib/users";

export type CurrentUser = { id: string; name: string; email: string; role: UserRole; storeKeys: string[] };
const UserContext = createContext<CurrentUser | null>(null);
export function UserProvider({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
export function useCurrentUser() {
  const user = useContext(UserContext);
  if (!user) throw new Error("useCurrentUser must be inside UserProvider");
  return user;
}
