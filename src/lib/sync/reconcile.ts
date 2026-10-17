import { randomUUID } from "node:crypto";
import { assertProductionSyncConfiguration } from "./config";
import { SYNC_SCHEMA_VERSION, type ReconcileState, type SyncStatus } from "./types";
import { fetchLocations, fetchVariantPage } from "./shopify";
import {
  acquireReconcileRunnerLock,
  acquireWriterLock,
  appendSnapshotVariants,
  getCurrentSnapshotId,
  getReconcileState,
  getSyncStatus,
  prepareSnapshot,
  publishSnapshot,
  releaseReconcileRunnerLock,
  releaseWriterLock,
  renewWriterLock,
  setReconcileState,
  setSyncStatus,
} from "./store";

export type ReconcileResult = {
  state: "busy" | "progress" | "complete" | "failed" | "skipped";
  processedVariants: number;
  snapshotId?: string;
  error?: string;
};

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected reconciliation error";
  return message.slice(0, 500);
}

async function updateProgressStatus(
  state: ReconcileState,
  message: string,
): Promise<void> {
  const previous = await getSyncStatus();
  const status: SyncStatus = {
    ...previous,
    phase: "syncing",
    reason: state.reason,
    startedAt: state.startedAt,
    updatedAt: new Date().toISOString(),
    completedAt: null,
    processedVariants: state.processedVariants,
    message,
    error: null,
  };
  await setSyncStatus(status);
}

async function resumeOrStart(reason: string): Promise<ReconcileState | null> {
  const existing = await getReconcileState();
  if (existing) {
    if (await renewWriterLock(existing.lockToken)) return existing;
    const replacement = await acquireWriterLock();
    if (!replacement) return null;
    const resumed = { ...existing, lockToken: replacement };
    await setReconcileState(resumed);
    return resumed;
  }
  const lockToken = await acquireWriterLock();
  if (!lockToken) return null;
  try {
    const locations = await fetchLocations();
    const state: ReconcileState = {
      snapshotId: `${Date.now()}-${randomUUID().slice(0, 8)}`,
      lockToken,
      cursor: null,
      processedVariants: 0,
      productIds: [],
      locations,
      startedAt: new Date().toISOString(),
      reason,
    };
    await prepareSnapshot(state.snapshotId);
    await setReconcileState(state);
    await updateProgressStatus(state, "Lecture du catalogue Shopify");
    return state;
  } catch (error) {
    await releaseWriterLock(lockToken);
    throw error;
  }
}

async function runReconciliationSliceLocked(options?: {
  reason?: string;
  budgetMs?: number;
  skipWhenReady?: boolean;
}): Promise<ReconcileResult> {
  const reason = options?.reason || "scheduled";
  if (
    options?.skipWhenReady &&
    (await getCurrentSnapshotId()) &&
    !(await getReconcileState())
  ) {
    return { state: "skipped", processedVariants: 0 };
  }
  let state: ReconcileState | null = null;
  try {
    state = await resumeOrStart(reason);
    if (!state) return { state: "busy", processedVariants: 0 };
    const deadline = Date.now() + Math.max(1_500, options?.budgetMs || 6_500);
    let pages = 0;
    while (Date.now() < deadline && pages < 10) {
      if (!(await renewWriterLock(state.lockToken))) {
        throw new Error("Reconciliation lock was lost");
      }
      const page = await fetchVariantPage(state.cursor, state.locations);
      await appendSnapshotVariants(state.snapshotId, page.variants);
      state = {
        ...state,
        cursor: page.endCursor,
        processedVariants: state.processedVariants + page.variants.length,
        productIds: [
          ...new Set([...state.productIds, ...page.variants.map((variant) => variant.productId)]),
        ],
      };
      pages += 1;
      await setReconcileState(state);
      await updateProgressStatus(
        state,
        `${state.processedVariants} variantes vérifiées`,
      );
      if (!page.hasNextPage) {
        const now = new Date().toISOString();
        const meta = await publishSnapshot(state.snapshotId, state.lockToken, {
          schemaVersion: SYNC_SCHEMA_VERSION,
          snapshotId: state.snapshotId,
          publishedAt: now,
          verifiedAt: now,
          reconciledAt: now,
          locations: state.locations,
        });
        await setReconcileState(null);
        await setSyncStatus({
          phase: "ready",
          reason: state.reason,
          startedAt: state.startedAt,
          updatedAt: now,
          completedAt: now,
          lastVerifiedAt: now,
          lastReconciledAt: now,
          processedVariants: meta.variantCount,
          message: "Instantané Shopify publié",
          error: null,
        });
        await releaseWriterLock(state.lockToken);
        return {
          state: "complete",
          processedVariants: meta.variantCount,
          snapshotId: state.snapshotId,
        };
      }
      if (!state.cursor) throw new Error("Shopify pagination returned no cursor");
    }
    return {
      state: "progress",
      processedVariants: state.processedVariants,
      snapshotId: state.snapshotId,
    };
  } catch (error) {
    const message = publicError(error);
    const hasLastKnownGood = Boolean(await getCurrentSnapshotId());
    const previous = await getSyncStatus();
    await setSyncStatus({
      ...previous,
      phase: hasLastKnownGood ? "degraded" : "error",
      updatedAt: new Date().toISOString(),
      message: hasLastKnownGood
        ? "Le dernier instantané valide reste disponible"
        : "La synchronisation initiale a échoué",
      error: message,
    });
    if (state) await releaseWriterLock(state.lockToken);
    return {
      state: "failed",
      processedVariants: state?.processedVariants || 0,
      snapshotId: state?.snapshotId,
      error: message,
    };
  }
}

export async function runReconciliationSlice(options?: {
  reason?: string;
  budgetMs?: number;
  skipWhenReady?: boolean;
}): Promise<ReconcileResult> {
  assertProductionSyncConfiguration();
  const runnerToken = await acquireReconcileRunnerLock();
  if (!runnerToken) return { state: "busy", processedVariants: 0 };
  try {
    return await runReconciliationSliceLocked(options);
  } finally {
    await releaseReconcileRunnerLock(runnerToken);
  }
}
