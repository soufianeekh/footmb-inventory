import type { InventoryVariant, LocationKey } from "../inventory";

export const SYNC_SCHEMA_VERSION = 2;

export type CachedInventoryVariant = InventoryVariant & {
  inventoryItemId: string;
  locationIds: Partial<Record<LocationKey, string>>;
  sourceUpdatedAt: string;
};

export type InventoryLocation = {
  key: LocationKey;
  id: string;
  name: string;
};

export type SnapshotMeta = {
  schemaVersion: number;
  snapshotId: string;
  revision: number;
  publishedAt: string;
  verifiedAt: string;
  reconciledAt: string;
  variantCount: number;
  productCount: number;
  locations: InventoryLocation[];
};

export type SyncPhase =
  | "empty"
  | "syncing"
  | "ready"
  | "degraded"
  | "error";

export type SyncStatus = {
  phase: SyncPhase;
  reason: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  lastVerifiedAt: string | null;
  lastReconciledAt: string | null;
  processedVariants: number;
  message: string | null;
  error: string | null;
};

export type ReconcileState = {
  snapshotId: string;
  lockToken: string;
  cursor: string | null;
  processedVariants: number;
  productIds: string[];
  locations: InventoryLocation[];
  startedAt: string;
  reason: string;
};

export type WebhookTopic =
  | "inventory_levels/update"
  | "inventory_levels/connect"
  | "inventory_levels/disconnect"
  | "products/create"
  | "products/update"
  | "products/delete";

export const SUPPORTED_WEBHOOK_TOPICS = new Set<WebhookTopic>([
  "inventory_levels/update",
  "inventory_levels/connect",
  "inventory_levels/disconnect",
  "products/create",
  "products/update",
  "products/delete",
]);

export type QueuedWebhook = {
  id: string;
  topic: WebhookTopic;
  shop: string;
  apiVersion: string | null;
  triggeredAt: string;
  receivedAt: string;
  attempts: number;
  payload: Record<string, unknown>;
};

export type InventorySnapshot = {
  meta: SnapshotMeta;
  variants: CachedInventoryVariant[];
};

export type QueueStats = {
  ready: number;
  retry: number;
  dead: number;
  oldestReceivedAt: string | null;
};

export type Diagnostics = {
  backend: "redis" | "memory";
  productionReady: boolean;
  snapshot: SnapshotMeta | null;
  status: SyncStatus;
  queue: QueueStats;
  configuredShop: string | null;
  apiVersion: string;
  webhookTopics: WebhookTopic[];
};
