import { auth } from "@/auth";

export async function isAdminSession(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
}

export async function isAuthenticatedSession(): Promise<boolean> {
  return Boolean((await auth())?.user?.email);
}

export async function isEditorSession(): Promise<boolean> {
  const role = (await auth())?.user?.role;
  return role === "editor" || role === "admin";
}
