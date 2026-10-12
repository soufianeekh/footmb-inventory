import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";

const envPath = new URL("../.env.local", import.meta.url);
let content = await readFile(envPath, "utf8").catch(() => "");
const reset = process.argv.includes("--reset");
if (/^FOOTMB_ADMIN_PASSWORD_HASH_B64=/m.test(content) && !reset) {
  console.log("FOOTMB admin already configured. Use --reset to change its password.");
  process.exit(0);
}
const password = randomBytes(24).toString("base64url");
const hash = await bcrypt.hash(password, 12);
const existing = new Map();
for (const line of content.split(/\r?\n/)) {
  if (line.startsWith("#") || !line.includes("=")) continue;
  const ix = line.indexOf("=");
  existing.set(line.slice(0,ix).trim(), line.slice(ix+1));
}
const variables = {
  FOOTMB_ADMIN_EMAIL: existing.get("FOOTMB_ADMIN_EMAIL") || "admin@footmb.local",
  FOOTMB_ADMIN_PASSWORD_HASH_B64: Buffer.from(hash, "utf8").toString("base64url"),
  AUTH_SECRET: existing.get("AUTH_SECRET") || randomBytes(32).toString("base64url"),
};
for (const [key,val] of Object.entries(variables)) {
  const encoded = JSON.stringify(val);
  if (new RegExp(`^${key}=.*$`, "m").test(content)) content=content.replace(new RegExp(`^${key}=.*$`, "m"),`${key}=${encoded}`);
  else content += `\n${key}=${encoded}\n`;
}
await writeFile(envPath, content.replace(/^\n+/,""), { encoding: "utf8", mode: 0o600 });
console.log("\nLogin configured. Your username:", variables.FOOTMB_ADMIN_EMAIL);
console.log("ONE-TIME PASSWORD (store it in a password manager):", password);
console.log("\nThe plaintext password is not saved. Do not send it to ChatGPT.");
console.log("Restart Next.js after changing .env.local. In production configure Upstash Redis login rate limiting.");
