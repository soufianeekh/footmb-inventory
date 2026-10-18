import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";
import bcrypt from "bcryptjs";
import { hasDatabaseConfiguration } from "@/lib/db";
import { ensureManagementContext } from "@/lib/management-context";
import type { UserRole } from "@/lib/permissions";
import { hasRedisConfiguration, INVENTORY_PREFIX } from "@/lib/sync/config";

export type { UserRole } from "@/lib/permissions";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string | null;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  storeKeys: string[];
  invitationPending: boolean;
};
export type PublicUser = Omit<AppUser, "passwordHash">;

export const PRIMARY_BUILDER_ID = "00000000-0000-4000-8000-000000000001";
const USERS_KEY = `${INVENTORY_PREFIX}:users`;
const redis = hasRedisConfiguration() ? Redis.fromEnv({ automaticDeserialization: false }) : null;
const globalUsers = globalThis as typeof globalThis & { __footmbUsers?: Map<string, AppUser> };
const memoryUsers = () => (globalUsers.__footmbUsers ||= new Map());

function primaryBuilderFromEnvironment(): AppUser | null {
  const email = process.env.FOOTMB_ADMIN_EMAIL?.trim().toLowerCase();
  const encoded = process.env.FOOTMB_ADMIN_PASSWORD_HASH_B64;
  if (!email || !encoded) return null;
  return {
    id: PRIMARY_BUILDER_ID,
    name: process.env.FOOTMB_ADMIN_NAME?.trim() || "FOOTMB Builder",
    email,
    role: "builder",
    passwordHash: Buffer.from(encoded, "base64url").toString("utf8"),
    active: true,
    createdAt: "environment",
    lastLoginAt: null,
    storeKeys: [],
    invitationPending: false,
  };
}

function parseLegacyUser(value: unknown): AppUser | null {
  if (typeof value !== "string") return null;
  try {
    const raw = JSON.parse(value) as Partial<AppUser>;
    if (!raw.id || !raw.email || !raw.name || !raw.passwordHash) return null;
    return {
      id: raw.id,
      name: raw.name,
      email: raw.email.toLowerCase(),
      role: raw.role === "admin" ? "admin" : raw.role === "editor" ? "editor" : "reader",
      passwordHash: raw.passwordHash,
      active: raw.active !== false,
      createdAt: raw.createdAt || new Date(0).toISOString(),
      lastLoginAt: raw.lastLoginAt || null,
      storeKeys: raw.storeKeys || [],
      invitationPending: false,
    };
  } catch {
    return null;
  }
}

function toPublicUser(user: AppUser): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  void _passwordHash;
  return publicUser;
}

async function ensurePrimaryBuilder() {
  const builder = primaryBuilderFromEnvironment();
  if (!builder) return null;
  const { sql, shopId } = await ensureManagementContext();
  const existing = await sql<{ id: string }[]>`select id from app_users where shop_id = ${shopId} and email = ${builder.email}`;
  if (existing[0]) {
    await sql`update app_users set display_name = ${builder.name}, role = 'builder', active = true,
      deactivated_at = null, updated_at = now() where id = ${existing[0].id}`;
    builder.id = existing[0].id;
  } else {
    await sql`insert into app_users (id, shop_id, email, display_name, role, active)
      values (${builder.id}, ${shopId}, ${builder.email}, ${builder.name}, 'builder', true)`;
  }
  return { builder, sql, shopId };
}

type UserRow = {
  id: string; display_name: string; email: string; role: UserRole; password_hash: string | null;
  active: boolean; created_at: Date; last_login_at: Date | null; store_keys: string[] | null;
  invitation_pending: boolean;
};

function fromRow(row: UserRow): AppUser {
  return {
    id: row.id, name: row.display_name, email: row.email, role: row.role,
    passwordHash: row.password_hash, active: row.active, createdAt: row.created_at.toISOString(),
    lastLoginAt: row.last_login_at?.toISOString() || null, storeKeys: row.store_keys || [],
    invitationPending: row.invitation_pending,
  };
}

const USER_SELECT = `select u.id, u.display_name, u.email, u.role, u.password_hash, u.active,
  u.created_at, u.last_login_at,
  coalesce(array_agg(ula.location_key) filter (where ula.location_key is not null), '{}') as store_keys,
  exists(select 1 from user_invitations i where i.user_id = u.id and i.accepted_at is null
    and i.revoked_at is null and i.expires_at > now()) as invitation_pending
  from app_users u left join user_location_assignments ula on ula.user_id = u.id`;

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const normalized = email.trim().toLowerCase();
  const builder = primaryBuilderFromEnvironment();
  if (builder?.email === normalized) {
    const context = hasDatabaseConfiguration() ? await ensurePrimaryBuilder() : null;
    return context?.builder || builder;
  }
  if (hasDatabaseConfiguration()) {
    const { sql, shopId } = await ensureManagementContext();
    const rows = await sql.unsafe<UserRow[]>(`${USER_SELECT} where u.shop_id = $1 and u.email = $2 group by u.id`, [shopId, normalized]);
    return rows[0] ? fromRow(rows[0]) : null;
  }
  if (!redis) return memoryUsers().get(normalized) || null;
  return parseLegacyUser(await redis.hget<string>(USERS_KEY, normalized));
}

export async function listUsers(): Promise<PublicUser[]> {
  if (hasDatabaseConfiguration()) {
    const context = await ensurePrimaryBuilder();
    const { sql, shopId } = context || await ensureManagementContext();
    const rows = await sql.unsafe<UserRow[]>(`${USER_SELECT} where u.shop_id = $1 group by u.id order by u.display_name`, [shopId]);
    return rows.map(fromRow).map(toPublicUser);
  }
  const builder = primaryBuilderFromEnvironment();
  const stored = !redis ? [...memoryUsers().values()] :
    Object.values((await redis.hgetall<Record<string, string>>(USERS_KEY)) || {}).map(parseLegacyUser).filter((user): user is AppUser => Boolean(user));
  return [...(builder ? [builder] : []), ...stored].map(toPublicUser).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function inviteUser(input: {
  name: string; email: string; role: Exclude<UserRole, "builder">; storeKeys: string[]; active: boolean; createdBy: string;
}) {
  if (!hasDatabaseConfiguration()) throw new Error("Une connexion à la base de données durable est requise pour gérer les employés");
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Adresse e-mail invalide");
  if (name.length < 2 || name.length > 120) throw new Error("Nom invalide");
  if (!(["admin", "editor", "reader"] as const).includes(input.role)) throw new Error("Profil invalide");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { sql, shopId } = await ensureManagementContext();
  const uniqueStores = [...new Set(input.storeKeys)].filter((key) => ["stockCasa", "casa", "tanger"].includes(key));
  const user = await sql.begin(async (tx) => {
    const existing = await tx<{ id: string }[]>`select id from app_users where shop_id = ${shopId} and email = ${email}`;
    if (existing.length) throw new Error("Cet utilisateur existe déjà");
    const [created] = await tx<{ id: string }[]>`
      insert into app_users (shop_id, email, display_name, role, active)
      values (${shopId}, ${email}, ${name}, ${input.role}, ${input.active}) returning id`;
    for (const key of uniqueStores) {
      await tx`insert into user_location_assignments (user_id, shop_id, location_key, assigned_by)
        select ${created.id}, ${shopId}, ${key}, ${input.createdBy}
        where exists (select 1 from shop_locations where shop_id = ${shopId} and location_key = ${key})`;
    }
    await tx`insert into user_invitations (user_id, token_hash, created_by, expires_at)
      values (${created.id}, ${tokenHash}, ${input.createdBy}, now() + interval '48 hours')`;
    return created;
  });
  const created = (await listUsers()).find((item) => item.id === user.id);
  if (!created) throw new Error("Utilisateur introuvable après création");
  return { user: created, token };
}

export async function acceptInvitation(token: string, password: string) {
  if (!hasDatabaseConfiguration()) throw new Error("Base de données indisponible");
  if (password.length < 10 || password.length > 512) throw new Error("Le mot de passe doit contenir au moins 10 caractères");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { sql } = await ensureManagementContext();
  const passwordHash = await bcrypt.hash(password, 12);
  const accepted = await sql.begin(async (tx) => {
    const rows = await tx<{ id: string; user_id: string }[]>`select id, user_id from user_invitations
      where token_hash = ${tokenHash} and accepted_at is null and revoked_at is null and expires_at > now() for update`;
    if (!rows[0]) throw new Error("Invitation invalide ou expirée");
    await tx`update app_users set password_hash = ${passwordHash}, updated_at = now() where id = ${rows[0].user_id}`;
    await tx`update user_invitations set accepted_at = now() where id = ${rows[0].id}`;
    return rows[0].user_id;
  });
  return { userId: accepted };
}

export async function updateUser(input: {
  id: string; role?: Exclude<UserRole, "builder">; active?: boolean; storeKeys?: string[]; updatedBy: string;
}) {
  if (!hasDatabaseConfiguration()) throw new Error("Une connexion à la base de données durable est requise pour gérer les employés");
  const { sql, shopId } = await ensureManagementContext();
  if (input.id === PRIMARY_BUILDER_ID) throw new Error("Le compte Builder principal est protégé");
  if (input.role && !(["admin", "editor", "reader"] as const).includes(input.role)) throw new Error("Profil invalide");
  await sql.begin(async (tx) => {
    const target = await tx<{ role: UserRole }[]>`select role from app_users where id = ${input.id} and shop_id = ${shopId} for update`;
    if (!target[0]) throw new Error("Utilisateur introuvable");
    if (target[0].role === "builder") throw new Error("Un Builder ne peut pas être modifié ici");
    if (input.role) await tx`update app_users set role = ${input.role}, updated_at = now() where id = ${input.id}`;
    if (typeof input.active === "boolean") await tx`update app_users set active = ${input.active},
      deactivated_at = ${input.active ? null : new Date()}, updated_at = now() where id = ${input.id}`;
    if (input.storeKeys) {
      await tx`delete from user_location_assignments where user_id = ${input.id}`;
      for (const key of [...new Set(input.storeKeys)].filter((value) => ["stockCasa", "casa", "tanger"].includes(value))) {
        await tx`insert into user_location_assignments (user_id, shop_id, location_key, assigned_by)
          select ${input.id}, ${shopId}, ${key}, ${input.updatedBy}
          where exists (select 1 from shop_locations where shop_id = ${shopId} and location_key = ${key})`;
      }
    }
  });
  const user = (await listUsers()).find((item) => item.id === input.id);
  if (!user) throw new Error("Utilisateur introuvable");
  return user;
}
