import { Redis } from "@upstash/redis";
import { hasRedisConfiguration, INVENTORY_PREFIX } from "./sync/config";
import type { LocationKey } from "./inventory";

export type ManualSaleSource = "delivery" | "store";
export type SaleLine = {
  variantId: string;
  inventoryItemId: string;
  productId: string;
  productName: string;
  size: string;
  location: LocationKey;
  locationId: string;
  quantity: number;
  quantityBefore: number;
};
export type SaleEvent = {
  id: string;
  status: "pending" | "completed" | "failed";
  source: ManualSaleSource;
  lines: SaleLine[];
  actor: { id: string; name: string; email: string };
  createdAt: string;
  completedAt: string | null;
  error: string | null;
};

const SALES_KEY = `${INVENTORY_PREFIX}:sales:events`;
const redis = hasRedisConfiguration() ? Redis.fromEnv({ automaticDeserialization: false }) : null;
const globalSales = globalThis as typeof globalThis & { __footmbSales?: Map<string, SaleEvent> };
const memorySales = () => (globalSales.__footmbSales ||= new Map());

function parseSale(value: unknown): SaleEvent | null {
  if (typeof value !== "string") return null;
  try { return JSON.parse(value) as SaleEvent; } catch { return null; }
}

export async function getSale(id: string): Promise<SaleEvent | null> {
  if (!redis) return memorySales().get(id) || null;
  return parseSale(await redis.hget<string>(SALES_KEY, id));
}

export async function putSale(event: SaleEvent): Promise<void> {
  if (!redis) {
    memorySales().set(event.id, event);
    return;
  }
  await redis.hset(SALES_KEY, { [event.id]: JSON.stringify(event) });
}

export async function listSales(limit = 500): Promise<SaleEvent[]> {
  const values = !redis
    ? [...memorySales().values()]
    : Object.values((await redis.hgetall<Record<string, string>>(SALES_KEY)) || {})
        .map(parseSale)
        .filter((event): event is SaleEvent => Boolean(event));
  return values
    .filter((event) => event.status === "completed")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
