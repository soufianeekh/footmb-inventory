import { createHmac, timingSafeEqual } from "node:crypto";
import { configuredShop } from "./config";
import {
  SUPPORTED_WEBHOOK_TOPICS,
  type QueuedWebhook,
  type WebhookTopic,
} from "./types";

export const MAX_WEBHOOK_BYTES = 1_000_000;

function header(headers: Headers, name: string): string {
  return headers.get(name)?.trim() || "";
}

export function verifyWebhookSignature(
  rawBody: Uint8Array,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseWebhook(
  rawBody: Uint8Array,
  headers: Headers,
  now = new Date(),
): QueuedWebhook {
  const id = header(headers, "x-shopify-webhook-id");
  const topic = header(headers, "x-shopify-topic") as WebhookTopic;
  const shop = header(headers, "x-shopify-shop-domain").toLowerCase();
  const triggeredAt = header(headers, "x-shopify-triggered-at") || now.toISOString();
  if (!id || id.length > 200) throw new Error("Missing or invalid webhook id");
  if (!SUPPORTED_WEBHOOK_TOPICS.has(topic)) throw new Error("Unsupported webhook topic");
  if (shop !== configuredShop()) throw new Error("Webhook shop does not match configuration");
  const parsed = JSON.parse(Buffer.from(rawBody).toString("utf8")) as unknown;
  if (!isRecord(parsed)) throw new Error("Webhook payload must be an object");
  if (topic.startsWith("inventory_levels/") && !parsed.inventory_item_id) {
    throw new Error("Inventory webhook is missing inventory_item_id");
  }
  if (topic.startsWith("products/") && !parsed.id) {
    throw new Error("Product webhook is missing id");
  }
  return {
    id,
    topic,
    shop,
    apiVersion: header(headers, "x-shopify-api-version") || null,
    triggeredAt,
    receivedAt: now.toISOString(),
    attempts: 0,
    payload: parsed,
  };
}
