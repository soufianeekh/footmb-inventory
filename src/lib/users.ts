import { Redis } from "@upstash/redis";
import bcrypt from "bcryptjs";
import { hasRedisConfiguration, INVENTORY_PREFIX } from "./sync/config";

export type UserRole = "reader" | "editor" | "admin";
export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  active: boolean;
  createdAt: string;
};
export type PublicUser = Omit<AppUser, "passwordHash">;

const USERS_KEY = `${INVENTORY_PREFIX}:users`;
const redis = hasRedisConfiguration() ? Redis.fromEnv({ automaticDeserialization: false }) : null;
const globalUsers = globalThis as typeof globalThis & { __footmbUsers?: Map<string, AppUser> };
const memoryUsers = () => (globalUsers.__footmbUsers ||= new Map());

function adminFromEnvironment(): AppUser | null {
  const email = process.env.FOOTMB_ADMIN_EMAIL?.trim().toLowerCase();
  const encoded = process.env.FOOTMB_ADMIN_PASSWORD_HASH_B64;
  if (!email || !encoded) return null;
  return {
    id: "footmb-admin",
    name: "FOOTMB Admin",
    email,
    role: "admin",
    passwordHash: Buffer.from(encoded, "base64url").toString("utf8"),
    active: true,
    createdAt: "environment",
  };
}

function parseUser(value: unknown): AppUser | null {
  if (typeof value !== "string") return null;
  try { return JSON.parse(value) as AppUser; } catch { return null; }
}

function toPublicUser(user: AppUser): PublicUser {
  const copy: Partial<AppUser> = { ...user };
  delete copy.passwordHash;
  return copy as PublicUser;
}

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const normalized = email.trim().toLowerCase();
  const admin = adminFromEnvironment();
  if (admin?.email === normalized) return admin;
  if (!redis) return memoryUsers().get(normalized) || null;
  return parseUser(await redis.hget<string>(USERS_KEY, normalized));
}

export async function listUsers(): Promise<PublicUser[]> {
  const admin = adminFromEnvironment();
  const stored = !redis
    ? [...memoryUsers().values()]
    : Object.values((await redis.hgetall<Record<string, string>>(USERS_KEY)) || {})
        .map(parseUser)
        .filter((user): user is AppUser => Boolean(user));
  return [...(admin ? [admin] : []), ...stored]
    .map(toPublicUser)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: Exclude<UserRole, "admin">;
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Adresse e-mail invalide");
  if (input.name.trim().length < 2) throw new Error("Nom invalide");
  if (input.password.length < 10 || input.password.length > 512) {
    throw new Error("Le mot de passe doit contenir au moins 10 caractères");
  }
  if (await findUserByEmail(email)) throw new Error("Cet utilisateur existe déjà");
  const user: AppUser = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    email,
    role: input.role,
    passwordHash: await bcrypt.hash(input.password, 12),
    active: true,
    createdAt: new Date().toISOString(),
  };
  if (!redis) memoryUsers().set(email, user);
  else await redis.hset(USERS_KEY, { [email]: JSON.stringify(user) });
  return toPublicUser(user);
}

export async function deleteUser(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (adminFromEnvironment()?.email === normalized) throw new Error("Le compte administrateur principal ne peut pas être supprimé");
  if (!redis) memoryUsers().delete(normalized);
  else await redis.hdel(USERS_KEY, normalized);
}
