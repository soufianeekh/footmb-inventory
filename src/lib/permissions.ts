export type UserRole = "reader" | "editor" | "admin" | "builder";

export const PERMISSIONS = [
  "dashboard.read",
  "inventory.read",
  "inventory.verify",
  "pos.read",
  "pos.adjust",
  "statistics.read",
  "alerts.read",
  "alerts.manage",
  "notes.read",
  "notes.write",
  "notifications.read",
  "notifications.manage",
  "staff.read",
  "staff.manage",
  "staff.activity.read",
  "settings.read",
  "settings.manage",
  "sync.manage",
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READER_PERMISSIONS = [
  "dashboard.read",
  "inventory.read",
  "notes.read",
] as const satisfies readonly Permission[];

const EDITOR_PERMISSIONS = [
  ...READER_PERMISSIONS,
  "inventory.verify",
  "pos.read",
  "pos.adjust",
  "alerts.read",
  "alerts.manage",
  "notes.write",
] as const satisfies readonly Permission[];

const ADMIN_PERMISSIONS = [
  ...EDITOR_PERMISSIONS,
  "statistics.read",
  "notifications.read",
  "notifications.manage",
  "staff.read",
  "staff.activity.read",
  "settings.read",
  "sync.manage",
  "audit.read",
] as const satisfies readonly Permission[];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  reader: new Set(READER_PERMISSIONS),
  editor: new Set(EDITOR_PERMISSIONS),
  admin: new Set(ADMIN_PERMISSIONS),
  builder: new Set(PERMISSIONS),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

