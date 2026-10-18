import "server-only";

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

function deriveKey(purpose: string): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be configured to protect customer contact details");
  }
  return Buffer.from(hkdfSync("sha256", secret, "footmb-management", purpose, 32));
}

export function encryptCustomerContact(contact: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey("customer-alert-contact:v1"), iv);
  const ciphertext = Buffer.concat([cipher.update(contact, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptCustomerContact(payload: Buffer): string {
  if (payload.length < 30 || payload[0] !== 1) throw new Error("Unsupported encrypted contact format");
  const iv = payload.subarray(1, 13);
  const tag = payload.subarray(13, 29);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey("customer-alert-contact:v1"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload.subarray(29)), decipher.final()]).toString("utf8");
}

export function customerContactLookupHash(contact: string): string {
  return createHmac("sha256", deriveKey("customer-alert-lookup:v1"))
    .update(contact.trim().toLowerCase())
    .digest("hex");
}

export function maskCustomerContact(contact: string): string {
  if (contact.includes("@")) {
    const [name, domain] = contact.split("@", 2);
    return `${name.slice(0, 1)}${"•".repeat(Math.min(Math.max(name.length - 1, 3), 8))}@${domain}`;
  }
  const digits = contact.replace(/\D/g, "");
  return `${contact.startsWith("+") ? "+" : ""}${"•".repeat(Math.max(0, digits.length - 3))}${digits.slice(-3)}`;
}
