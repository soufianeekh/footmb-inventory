import { assertProductionSyncConfiguration, normalizeGid } from "./config";
import { promoteAvailableCustomerAlerts } from "@/lib/customer-alert-availability";
import { fetchInventoryItemVariant, fetchProductVariants } from "./shopify";
import {
  acquireWriterLock,
  applyInventoryItemVariant,
  claimWebhookBatch,
  completeWebhook,
  getSnapshot,
  getSyncStatus,
  releaseWebhook,
  releaseWriterLock,
  removeInventoryItem,
  replaceProductVariants,
  retryWebhook,
  setSyncStatus,
} from "./store";
import type { QueuedWebhook } from "./types";

export type WorkerResult = {
  claimed: number;
  processed: number;
  failed: number;
  busy: boolean;
};

function targetKey(event: QueuedWebhook): string {
  if (event.topic.startsWith("inventory_levels/")) {
    return `inventory:${String(event.payload.inventory_item_id || "missing")}`;
  }
  return `product:${String(event.payload.id || "missing")}`;
}

function latest(events: QueuedWebhook[]): QueuedWebhook {
  return [...events].sort((a, b) =>
    (b.triggeredAt || b.receivedAt).localeCompare(a.triggeredAt || a.receivedAt),
  )[0];
}

async function processGroup(
  events: QueuedWebhook[],
  snapshotId: string,
  snapshot: NonNullable<Awaited<ReturnType<typeof getSnapshot>>>,
): Promise<void> {
  const event = latest(events);
  const verifiedAt = new Date().toISOString();
  let revision: number | null;
  if (event.topic.startsWith("inventory_levels/")) {
    const inventoryItemId = normalizeGid("InventoryItem", event.payload.inventory_item_id);
    if (!inventoryItemId) throw new Error("Webhook is missing inventory_item_id");
    const variant = await fetchInventoryItemVariant(inventoryItemId, snapshot.meta.locations);
    revision = variant
      ? await applyInventoryItemVariant(snapshotId, variant, verifiedAt)
      : await removeInventoryItem(snapshotId, inventoryItemId, verifiedAt);
  } else {
    const productId = normalizeGid("Product", event.payload.id);
    if (!productId) throw new Error("Webhook is missing product id");
    if (event.topic === "products/delete") {
      revision = await replaceProductVariants(snapshotId, productId, [], verifiedAt);
    } else {
      const variants = await fetchProductVariants(productId, snapshot.meta.locations);
      revision = await replaceProductVariants(
        snapshotId,
        productId,
        variants || [],
        verifiedAt,
      );
    }
  }
  if (revision === null) throw new Error("Snapshot changed while applying webhook");
}

export async function processInventoryQueue(limit = 20): Promise<WorkerResult> {
  assertProductionSyncConfiguration();
  const events = await claimWebhookBatch(limit);
  if (!events.length) return { claimed: 0, processed: 0, failed: 0, busy: false };
  const lockToken = await acquireWriterLock(60_000);
  if (!lockToken) {
    await Promise.all(events.map((event) => releaseWebhook(event.id)));
    return { claimed: events.length, processed: 0, failed: 0, busy: true };
  }
  let processed = 0;
  let failed = 0;
  try {
    const snapshot = await getSnapshot();
    if (!snapshot) {
      await Promise.all(events.map((event) => releaseWebhook(event.id)));
      return { claimed: events.length, processed: 0, failed: 0, busy: true };
    }
    const groups = new Map<string, QueuedWebhook[]>();
    for (const event of events) {
      const key = targetKey(event);
      const group = groups.get(key) || [];
      group.push(event);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      try {
        await processGroup(group, snapshot.meta.snapshotId, snapshot);
        await Promise.all(group.map((event) => completeWebhook(event.id)));
        processed += group.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Webhook processing failed";
        await Promise.all(group.map((event) => retryWebhook(event, message)));
        failed += group.length;
      }
    }
    const now = new Date().toISOString();
    const status = await getSyncStatus();
    await setSyncStatus({
      ...status,
      phase: failed && !processed ? "degraded" : "ready",
      updatedAt: now,
      lastVerifiedAt: processed ? now : status.lastVerifiedAt,
      message: processed ? `${processed} événement(s) Shopify appliqué(s)` : status.message,
      error: failed ? `${failed} événement(s) en attente de nouvelle tentative` : null,
    });
    if (processed > 0) {
      try {
        await promoteAvailableCustomerAlerts();
      } catch (error) {
        // Alert processing is downstream of inventory correctness. A database
        // hiccup must not cause Shopify inventory webhooks to be retried.
        console.error("Could not refresh customer stock alerts", error);
      }
    }
    return { claimed: events.length, processed, failed, busy: false };
  } finally {
    await releaseWriterLock(lockToken);
  }
}
