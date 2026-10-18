import { auth } from "@/auth";
import { hasPermission, type Permission } from "@/lib/permissions";

export async function hasPermissionSession(permission: Permission): Promise<boolean> {
  const role = (await auth())?.user?.role;
  return role ? hasPermission(role, permission) : false;
}

export async function permissionSession(permission: Permission) {
  const session = await auth();
  if (!session?.user?.email || !hasPermission(session.user.role, permission)) return null;
  return session;
}

export async function isAdminSession(): Promise<boolean> {
  return hasPermissionSession("staff.manage");
}

export async function isAuthenticatedSession(): Promise<boolean> {
  return Boolean((await auth())?.user?.email);
}

export async function isEditorSession(): Promise<boolean> {
  return hasPermissionSession("inventory.verify");
}
