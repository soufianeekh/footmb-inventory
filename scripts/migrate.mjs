import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const migrationsDirectory = path.resolve("netlify/database/migrations");

try {
  await sql`select pg_advisory_lock(hashtext('footmb_schema_migrations'))`;
  await sql`create table if not exists footmb_schema_migrations (
    filename text primary key, checksum text not null, applied_at timestamptz not null default now()
  )`;
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
  for (const filename of files) {
    const source = await readFile(path.join(migrationsDirectory, filename), "utf8");
    const checksum = createHash("sha256").update(source).digest("hex");
    const existing = await sql`select checksum from footmb_schema_migrations where filename = ${filename}`;
    if (existing[0]?.checksum && existing[0].checksum !== checksum) throw new Error(`Migration checksum changed: ${filename}`);
    if (existing.length) continue;
    await sql.begin((tx) => tx.unsafe(source));
    await sql`insert into footmb_schema_migrations (filename, checksum) values (${filename}, ${checksum})`;
    console.log(`Applied ${filename}`);
  }
} finally {
  await sql`select pg_advisory_unlock(hashtext('footmb_schema_migrations'))`.catch(() => undefined);
  await sql.end();
}
