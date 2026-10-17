import { beforeEach, describe, expect, it } from "vitest";
import type { CachedInventoryVariant, InventoryLocation, QueuedWebhook } from "./types";
import {
  acquireReconcileRunnerLock,
  acquireWriterLock,
  appendSnapshotVariants,
  applyInventoryItemVariant,
  claimWebhookBatch,
  enqueueWebhook,
  getQueueStats,
  getSnapshot,
  prepareSnapshot,
  publishSnapshot,
  releaseReconcileRunnerLock,
  releaseWriterLock,
  removeInventoryItem,
  replaceProductVariants,
  resetMemoryStoreForTests,
  retryWebhook,
} from "./store";

const locations: InventoryLocation[] = [
  { key: "casa", id: "gid://shopify/Location/1", name: "FOOTMB Casablanca" },
  { key: "tanger", id: "gid://shopify/Location/2", name: "FOOTMB Tanger" },
  { key: "stockCasa", id: "gid://shopify/Location/3", name: "Stock Casa" },
];

function variant(overrides: Partial<CachedInventoryVariant> = {}): CachedInventoryVariant {
  return {
    variantId: "gid://shopify/ProductVariant/10",
    productId: "gid://shopify/Product/1",
    inventoryItemId: "gid://shopify/InventoryItem/100",
    model: "Maillot test",
    image: null,
    size: "M",
    tracked: true,
    locationsComplete: true,
    stock: { casa: 2, tanger: 3, stockCasa: 4 },
    locationIds: { casa: locations[0].id, tanger: locations[1].id, stockCasa: locations[2].id },
    sourceUpdatedAt: "2026-10-14T12:00:00Z",
    ...overrides,
  };
}

function event(id = "event-1", attempts = 0): QueuedWebhook {
  return {
    id,
    topic: "inventory_levels/update",
    shop: "footmb-test.myshopify.com",
    apiVersion: "2026-10",
    triggeredAt: "2026-10-14T12:00:00Z",
    receivedAt: "2026-10-14T12:00:01Z",
    attempts,
    payload: { inventory_item_id: 100 },
  };
}

async function seed() {
  const token = await acquireWriterLock();
  expect(token).toBeTruthy();
  await prepareSnapshot("snapshot-1");
  await appendSnapshotVariants("snapshot-1", [variant()]);
  const meta = await publishSnapshot("snapshot-1", token!, {
    schemaVersion: 2,
    snapshotId: "snapshot-1",
    publishedAt: "2026-10-14T12:00:00Z",
    verifiedAt: "2026-10-14T12:00:00Z",
    reconciledAt: "2026-10-14T12:00:00Z",
    locations,
  });
  await releaseWriterLock(token!);
  return meta;
}

describe("inventory snapshot store", () => {
  beforeEach(() => resetMemoryStoreForTests());

  it("starts empty and atomically publishes a complete initial snapshot", async () => {
    expect(await getSnapshot()).toBeNull();
    const meta = await seed();
    const snapshot = await getSnapshot();
    expect(meta.revision).toBe(1);
    expect(snapshot?.meta.variantCount).toBe(1);
    expect(snapshot?.meta.productCount).toBe(1);
    expect(snapshot?.variants[0].stock).toEqual({ casa: 2, tanger: 3, stockCasa: 4 });
  });

  it("uses a fencing lock so only one writer can publish", async () => {
    const first = await acquireWriterLock();
    const second = await acquireWriterLock();
    expect(first).toBeTruthy();
    expect(second).toBeNull();
    await releaseWriterLock(first!);
    expect(await acquireWriterLock()).toBeTruthy();
  });

  it("allows only one reconciliation slice runner at a time", async () => {
    const first = await acquireReconcileRunnerLock();
    expect(first).toBeTruthy();
    expect(await acquireReconcileRunnerLock()).toBeNull();
    await releaseReconcileRunnerLock(first!);
    expect(await acquireReconcileRunnerLock()).toBeTruthy();
  });

  it("increments revisions only when an authoritative item actually changes", async () => {
    await seed();
    const updated = variant({ stock: { casa: 9, tanger: 1, stockCasa: 0 } });
    expect(await applyInventoryItemVariant("snapshot-1", updated, "2026-10-14T12:01:00Z")).toBe(2);
    expect(await applyInventoryItemVariant("snapshot-1", updated, "2026-10-14T12:02:00Z")).toBe(2);
    expect(await removeInventoryItem("snapshot-1", "missing-item", "2026-10-14T12:03:00Z")).toBe(2);
    const snapshot = await getSnapshot();
    expect(snapshot?.variants).toHaveLength(1);
    expect(snapshot?.variants[0].stock.casa).toBe(9);
  });

  it("handles targeted product create, update, and delete", async () => {
    await seed();
    const second = variant({
      variantId: "gid://shopify/ProductVariant/11",
      inventoryItemId: "gid://shopify/InventoryItem/101",
      size: "L",
    });
    await replaceProductVariants("snapshot-1", second.productId, [variant(), second], "2026-10-14T12:03:00Z");
    expect((await getSnapshot())?.variants).toHaveLength(2);
    await replaceProductVariants("snapshot-1", second.productId, [second], "2026-10-14T12:04:00Z");
    expect((await getSnapshot())?.variants.map((item) => item.variantId)).toEqual([second.variantId]);
    await replaceProductVariants("snapshot-1", second.productId, [], "2026-10-14T12:05:00Z");
    expect((await getSnapshot())?.variants).toHaveLength(0);
  });
});

describe("durable webhook queue behavior", () => {
  beforeEach(() => resetMemoryStoreForTests());

  it("deduplicates repeated Shopify delivery ids before enqueue", async () => {
    expect(await enqueueWebhook(event())).toBe(true);
    expect(await enqueueWebhook(event())).toBe(false);
    expect((await getQueueStats()).ready).toBe(1);
  });

  it("claims a queued event once and keeps it durable while in flight", async () => {
    await enqueueWebhook(event());
    expect(await claimWebhookBatch(10)).toHaveLength(1);
    expect(await claimWebhookBatch(10)).toHaveLength(0);
  });

  it("moves exhausted retries to the bounded dead-letter queue", async () => {
    const exhausted = event("event-dead", 7);
    await enqueueWebhook(exhausted);
    await claimWebhookBatch(1);
    await retryWebhook(exhausted, "Shopify unavailable");
    const stats = await getQueueStats();
    expect(stats.retry).toBe(0);
    expect(stats.dead).toBe(1);
  });
});
