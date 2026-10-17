import { assertProductionSyncConfiguration } from "./config";
import { fetchUpdatedInventoryItemPage } from "./shopify";
import {
  acquireReconcileRunnerLock,
  acquireWriterLock,
  applyInventoryItemVariant,
  getSnapshot,
  getSyncStatus,
  removeInventoryItem,
  releaseReconcileRunnerLock,
  releaseWriterLock,
  renewWriterLock,
  setSyncStatus,
} from "./store";

export type IncrementalSyncResult = {
  state: "busy" | "complete" | "failed" | "skipped";
  checkedItems: number;
  changedItems: number;
  revision?: number;
  error?: string;
};

const CHECKPOINT_OVERLAP_MS = 2 * 60_000;

export async function runIncrementalSync(options?: {
  reason?: string;
}): Promise<IncrementalSyncResult> {
  assertProductionSyncConfiguration();
  const runnerToken = await acquireReconcileRunnerLock(90_000);
  if (!runnerToken) return { state: "busy", checkedItems: 0, changedItems: 0 };
  let writerToken: string | null = null;
  try {
    const snapshot = await getSnapshot();
    if (!snapshot) return { state: "skipped", checkedItems: 0, changedItems: 0 };
    writerToken = await acquireWriterLock(90_000);
    if (!writerToken) return { state: "busy", checkedItems: 0, changedItems: 0 };

    const previousStatus = await getSyncStatus();
    const checkpoint = previousStatus.lastReconciledAt || snapshot.meta.reconciledAt;
    const since = new Date(Math.max(0, Date.parse(checkpoint) - CHECKPOINT_OVERLAP_MS)).toISOString();
    const until = new Date().toISOString();
    let cursor: string | null = null;
    let checkedItems = 0;
    let changedItems = 0;
    let revision = snapshot.meta.revision;

    for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
      if (!(await renewWriterLock(writerToken, 90_000))) throw new Error("Incremental sync lock was lost");
      const page = await fetchUpdatedInventoryItemPage(cursor, snapshot.meta.locations, since, until);
      for (const variant of page.variants) {
        const nextRevision = await applyInventoryItemVariant(snapshot.meta.snapshotId, variant, until);
        if (nextRevision === null) throw new Error("Inventory snapshot changed during incremental sync");
        checkedItems += 1;
        if (nextRevision > revision) changedItems += 1;
        revision = nextRevision;
      }
      for (const inventoryItemId of page.removedInventoryItemIds) {
        const nextRevision = await removeInventoryItem(snapshot.meta.snapshotId, inventoryItemId, until);
        if (nextRevision === null) throw new Error("Inventory snapshot changed during incremental sync");
        checkedItems += 1;
        if (nextRevision > revision) changedItems += 1;
        revision = nextRevision;
      }
      if (!page.hasNextPage) {
        await setSyncStatus({
          ...previousStatus,
          phase: "ready",
          reason: options?.reason || "incremental",
          updatedAt: until,
          completedAt: until,
          lastVerifiedAt: until,
          lastReconciledAt: until,
          processedVariants: checkedItems,
          message: changedItems
            ? `${changedItems} changements Shopify appliqués`
            : "Aucun changement Shopify",
          error: null,
        });
        return { state: "complete", checkedItems, changedItems, revision };
      }
      cursor = page.endCursor;
      if (!cursor) throw new Error("Shopify incremental pagination returned no cursor");
    }
    throw new Error("Shopify incremental page limit reached");
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Incremental sync failed").slice(0, 500);
    const previousStatus = await getSyncStatus();
    await setSyncStatus({
      ...previousStatus,
      phase: "degraded",
      updatedAt: new Date().toISOString(),
      message: "Le dernier inventaire valide reste disponible",
      error: message,
    });
    return { state: "failed", checkedItems: 0, changedItems: 0, error: message };
  } finally {
    if (writerToken) await releaseWriterLock(writerToken);
    await releaseReconcileRunnerLock(runnerToken);
  }
}
