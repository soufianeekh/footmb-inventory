export function shouldCheckInventoryVersion(
  visibility: DocumentVisibilityState,
  loading: boolean,
  authenticationExpired = false,
): boolean {
  return visibility === "visible" && !loading && !authenticationExpired;
}

export function shouldRefreshInventory(
  remoteRevision: number,
  localRevision: number,
): boolean {
  return Number.isFinite(remoteRevision) && remoteRevision > localRevision;
}

export const INVENTORY_POLL_INTERVAL_MS = 12_000;
export const INVENTORY_HIDDEN_POLL_INTERVAL_MS = 60_000;
export const INVENTORY_MAX_RETRY_DELAY_MS = 120_000;

export function getInventoryPollDelay(
  consecutiveFailures: number,
  visibility: DocumentVisibilityState,
): number {
  if (visibility !== "visible") return INVENTORY_HIDDEN_POLL_INTERVAL_MS;
  if (consecutiveFailures <= 0) return INVENTORY_POLL_INTERVAL_MS;
  return Math.min(
    INVENTORY_POLL_INTERVAL_MS * 2 ** Math.min(consecutiveFailures, 4),
    INVENTORY_MAX_RETRY_DELAY_MS,
  );
}
