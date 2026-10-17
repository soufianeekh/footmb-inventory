import type { LocationKey } from "../inventory";

export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-10";
export const INVENTORY_PREFIX = process.env.INVENTORY_REDIS_PREFIX || "footmb:inventory:v2";

export const DEFAULT_LOCATION_NAMES: Record<LocationKey, string> = {
  casa: "FOOTMB Casablanca",
  tanger: "FOOTMB Tanger",
  stockCasa: "Stock Casa",
};

export const LOCATION_ID_ENV: Record<LocationKey, string | undefined> = {
  casa: process.env.SHOPIFY_LOCATION_CASA_ID,
  tanger: process.env.SHOPIFY_LOCATION_TANGER_ID,
  stockCasa: process.env.SHOPIFY_LOCATION_STOCK_CASA_ID,
};

export function configuredShop(): string {
  const shop = process.env.SHOPIFY_SHOP?.trim().toLowerCase();
  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error("SHOPIFY_SHOP must be a valid myshopify.com domain");
  }
  return shop;
}

export function hasRedisConfiguration(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

export function assertProductionSyncConfiguration(): void {
  configuredShop();
  if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET) {
    throw new Error("Missing Shopify client credentials");
  }
  if (process.env.NODE_ENV === "production" && !hasRedisConfiguration()) {
    throw new Error("Upstash Redis is required for production inventory sync");
  }
}

export function normalizeGid(resource: string, value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return raw.startsWith("gid://shopify/")
    ? raw
    : `gid://shopify/${resource}/${raw}`;
}
