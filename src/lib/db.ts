import "server-only";
import postgres, { type Sql } from "postgres";
import { getConnectionString } from "@netlify/database";

const globalDatabase = globalThis as typeof globalThis & { __footmbSql?: Sql };

export function hasDatabaseConfiguration(): boolean {
  try {
    return Boolean(resolveDatabaseUrl());
  } catch {
    return false;
  }
}

function resolveDatabaseUrl(): string {
  const explicit = process.env.DATABASE_URL?.trim();
  if (explicit) return explicit;
  return getConnectionString();
}

export function database(): Sql {
  const url = resolveDatabaseUrl();
  if (!url) throw new Error("A database connection is required for durable staff data");
  return (globalDatabase.__footmbSql ||= postgres(url, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  }));
}

