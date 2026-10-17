import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
import { hasRedisConfiguration, INVENTORY_PREFIX } from "./config";
import type {
  CachedInventoryVariant,
  Diagnostics,
  InventorySnapshot,
  QueuedWebhook,
  QueueStats,
  ReconcileState,
  SnapshotMeta,
  SyncStatus,
} from "./types";

const K = {
  current: `${INVENTORY_PREFIX}:current`,
  revision: `${INVENTORY_PREFIX}:revision`,
  status: `${INVENTORY_PREFIX}:status`,
  reconcile: `${INVENTORY_PREFIX}:reconcile`,
  writerLock: `${INVENTORY_PREFIX}:lock:writer`,
  reconcileRunnerLock: `${INVENTORY_PREFIX}:lock:reconcile-runner`,
  queueReady: `${INVENTORY_PREFIX}:queue:ready`,
  queueRetry: `${INVENTORY_PREFIX}:queue:retry`,
  queueInflight: `${INVENTORY_PREFIX}:queue:inflight`,
  queueEvents: `${INVENTORY_PREFIX}:queue:events`,
  queueDead: `${INVENTORY_PREFIX}:queue:dead`,
  dedupe: (id: string) => `${INVENTORY_PREFIX}:dedupe:${id}`,
  snapshotMeta: (id: string) => `${INVENTORY_PREFIX}:snapshot:${id}:meta`,
  snapshotVariants: (id: string) => `${INVENTORY_PREFIX}:snapshot:${id}:variants`,
  snapshotItems: (id: string) => `${INVENTORY_PREFIX}:snapshot:${id}:items`,
  snapshotProducts: (id: string) => `${INVENTORY_PREFIX}:snapshot:${id}:products`,
};

const redis = hasRedisConfiguration()
  ? Redis.fromEnv({ automaticDeserialization: false })
  : null;

type MemorySnapshot = {
  meta: SnapshotMeta | null;
  variants: Map<string, CachedInventoryVariant>;
  items: Map<string, string>;
  products: Map<string, string[]>;
};

type MemoryState = {
  current: string | null;
  revision: number;
  status: SyncStatus | null;
  reconcile: ReconcileState | null;
  snapshots: Map<string, MemorySnapshot>;
  locks: Map<string, { token: string; expiresAt: number }>;
  events: Map<string, QueuedWebhook>;
  ready: string[];
  retry: Map<string, number>;
  inflight: Map<string, number>;
  dead: QueuedWebhook[];
  dedupe: Map<string, number>;
};

const globalMemory = globalThis as typeof globalThis & {
  __footmbInventoryMemory?: MemoryState;
};

function memory(): MemoryState {
  if (!globalMemory.__footmbInventoryMemory) {
    globalMemory.__footmbInventoryMemory = {
      current: null,
      revision: 0,
      status: null,
      reconcile: null,
      snapshots: new Map(),
      locks: new Map(),
      events: new Map(),
      ready: [],
      retry: new Map(),
      inflight: new Map(),
      dead: [],
      dedupe: new Map(),
    };
  }
  return globalMemory.__footmbInventoryMemory;
}

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function defaultStatus(): SyncStatus {
  return {
    phase: "empty",
    reason: "initial",
    startedAt: null,
    updatedAt: new Date().toISOString(),
    completedAt: null,
    lastVerifiedAt: null,
    lastReconciledAt: null,
    processedVariants: 0,
    message: "Aucun instantané publié",
    error: null,
  };
}

function ensureMemorySnapshot(id: string): MemorySnapshot {
  const state = memory();
  let snapshot = state.snapshots.get(id);
  if (!snapshot) {
    snapshot = {
      meta: null,
      variants: new Map(),
      items: new Map(),
      products: new Map(),
    };
    state.snapshots.set(id, snapshot);
  }
  return snapshot;
}

export function backendName(): "redis" | "memory" {
  return redis ? "redis" : "memory";
}

export async function getSyncStatus(): Promise<SyncStatus> {
  if (!redis) return memory().status || defaultStatus();
  return parseJson<SyncStatus>(await redis.get<string>(K.status)) || defaultStatus();
}

export async function setSyncStatus(status: SyncStatus): Promise<void> {
  if (!redis) {
    memory().status = status;
    return;
  }
  await redis.set(K.status, JSON.stringify(status));
}

export async function getCurrentSnapshotId(): Promise<string | null> {
  if (!redis) return memory().current;
  return (await redis.get<string>(K.current)) || null;
}

export async function getSnapshot(): Promise<InventorySnapshot | null> {
  const id = await getCurrentSnapshotId();
  if (!id) return null;
  if (!redis) {
    const snapshot = memory().snapshots.get(id);
    if (!snapshot?.meta) return null;
    return { meta: snapshot.meta, variants: [...snapshot.variants.values()] };
  }
  const pipeline = redis.pipeline();
  pipeline.get(K.snapshotMeta(id));
  pipeline.hvals(K.snapshotVariants(id));
  const [rawMeta, rawVariants] = (await pipeline.exec()) as [string | null, string[]];
  const meta = parseJson<SnapshotMeta>(rawMeta);
  if (!meta) return null;
  const variants = (rawVariants || [])
    .map((value) => parseJson<CachedInventoryVariant>(value))
    .filter((value): value is CachedInventoryVariant => Boolean(value));
  return { meta, variants };
}

export async function getSnapshotMeta(): Promise<SnapshotMeta | null> {
  const id = await getCurrentSnapshotId();
  if (!id) return null;
  if (!redis) return memory().snapshots.get(id)?.meta || null;
  return parseJson<SnapshotMeta>(await redis.get<string>(K.snapshotMeta(id)));
}

export async function acquireWriterLock(ttlMs = 90_000): Promise<string | null> {
  const token = randomUUID();
  if (!redis) {
    const state = memory();
    const existing = state.locks.get(K.writerLock);
    if (existing && existing.expiresAt > Date.now()) return null;
    state.locks.set(K.writerLock, { token, expiresAt: Date.now() + ttlMs });
    return token;
  }
  const result = await redis.set(K.writerLock, token, { nx: true, px: ttlMs });
  return result === "OK" ? token : null;
}

export async function acquireReconcileRunnerLock(
  ttlMs = 30_000,
): Promise<string | null> {
  const token = randomUUID();
  if (!redis) {
    const state = memory();
    const existing = state.locks.get(K.reconcileRunnerLock);
    if (existing && existing.expiresAt > Date.now()) return null;
    state.locks.set(K.reconcileRunnerLock, {
      token,
      expiresAt: Date.now() + ttlMs,
    });
    return token;
  }
  const result = await redis.set(K.reconcileRunnerLock, token, {
    nx: true,
    px: ttlMs,
  });
  return result === "OK" ? token : null;
}

export async function releaseReconcileRunnerLock(token: string): Promise<void> {
  if (!redis) {
    const lock = memory().locks.get(K.reconcileRunnerLock);
    if (lock?.token === token) memory().locks.delete(K.reconcileRunnerLock);
    return;
  }
  await redis.eval(
    `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`,
    [K.reconcileRunnerLock],
    [token],
  );
}

export async function renewWriterLock(token: string, ttlMs = 90_000): Promise<boolean> {
  if (!redis) {
    const lock = memory().locks.get(K.writerLock);
    if (!lock || lock.token !== token || lock.expiresAt <= Date.now()) return false;
    lock.expiresAt = Date.now() + ttlMs;
    return true;
  }
  const result = await redis.eval<[string, number], number>(
    `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end return 0`,
    [K.writerLock],
    [token, ttlMs],
  );
  return result === 1;
}

export async function releaseWriterLock(token: string): Promise<void> {
  if (!redis) {
    const lock = memory().locks.get(K.writerLock);
    if (lock?.token === token) memory().locks.delete(K.writerLock);
    return;
  }
  await redis.eval(
    `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`,
    [K.writerLock],
    [token],
  );
}

export async function getReconcileState(): Promise<ReconcileState | null> {
  if (!redis) return memory().reconcile;
  return parseJson<ReconcileState>(await redis.get<string>(K.reconcile));
}

export async function setReconcileState(state: ReconcileState | null): Promise<void> {
  if (!redis) {
    memory().reconcile = state;
    return;
  }
  if (!state) await redis.del(K.reconcile);
  else await redis.set(K.reconcile, JSON.stringify(state), { ex: 60 * 60 });
}

export async function prepareSnapshot(snapshotId: string): Promise<void> {
  if (!redis) {
    ensureMemorySnapshot(snapshotId);
    return;
  }
  const transaction = redis.multi();
  transaction.del(
    K.snapshotMeta(snapshotId),
    K.snapshotVariants(snapshotId),
    K.snapshotItems(snapshotId),
    K.snapshotProducts(snapshotId),
  );
  transaction.expire(K.snapshotVariants(snapshotId), 60 * 60);
  await transaction.exec();
}

export async function appendSnapshotVariants(
  snapshotId: string,
  variants: CachedInventoryVariant[],
): Promise<void> {
  if (!variants.length) return;
  if (!redis) {
    const snapshot = ensureMemorySnapshot(snapshotId);
    for (const variant of variants) {
      snapshot.variants.set(variant.variantId, variant);
      snapshot.items.set(variant.inventoryItemId, variant.variantId);
      const ids = snapshot.products.get(variant.productId) || [];
      if (!ids.includes(variant.variantId)) ids.push(variant.variantId);
      snapshot.products.set(variant.productId, ids);
    }
    return;
  }
  const variantsPayload: Record<string, string> = {};
  const itemPayload: Record<string, string> = {};
  const grouped = new Map<string, string[]>();
  for (const variant of variants) {
    variantsPayload[variant.variantId] = JSON.stringify(variant);
    itemPayload[variant.inventoryItemId] = variant.variantId;
    const ids = grouped.get(variant.productId) || [];
    ids.push(variant.variantId);
    grouped.set(variant.productId, ids);
  }
  const transaction = redis.multi();
  transaction.hset(K.snapshotVariants(snapshotId), variantsPayload);
  transaction.hset(K.snapshotItems(snapshotId), itemPayload);
  for (const [productId, ids] of grouped) {
    const existing = parseJson<string[]>(
      await redis.hget<string>(K.snapshotProducts(snapshotId), productId),
    ) || [];
    transaction.hset(K.snapshotProducts(snapshotId), {
      [productId]: JSON.stringify([...new Set([...existing, ...ids])]),
    });
  }
  transaction.expire(K.snapshotVariants(snapshotId), 60 * 60);
  transaction.expire(K.snapshotItems(snapshotId), 60 * 60);
  transaction.expire(K.snapshotProducts(snapshotId), 60 * 60);
  await transaction.exec();
}

export async function publishSnapshot(
  snapshotId: string,
  lockToken: string,
  meta: Omit<SnapshotMeta, "revision" | "variantCount" | "productCount">,
): Promise<SnapshotMeta> {
  if (!redis) {
    const state = memory();
    const lock = state.locks.get(K.writerLock);
    if (!lock || lock.token !== lockToken || lock.expiresAt <= Date.now()) {
      throw new Error("Reconciliation lock was lost before publication");
    }
    const snapshot = ensureMemorySnapshot(snapshotId);
    state.revision += 1;
    const completed: SnapshotMeta = {
      ...meta,
      revision: state.revision,
      variantCount: snapshot.variants.size,
      productCount: snapshot.products.size,
    };
    snapshot.meta = completed;
    state.current = snapshotId;
    return completed;
  }
  const script = `
    if redis.call('GET', KEYS[1]) ~= ARGV[1] then return redis.error_reply('LOCK_LOST') end
    local variantCount = redis.call('HLEN', KEYS[4])
    local productCount = redis.call('HLEN', KEYS[5])
    local revision = redis.call('INCR', KEYS[2])
    local meta = cjson.decode(ARGV[3])
    meta['revision'] = revision
    meta['variantCount'] = variantCount
    meta['productCount'] = productCount
    redis.call('SET', KEYS[6], cjson.encode(meta))
    local previous = redis.call('GET', KEYS[3])
    redis.call('SET', KEYS[3], ARGV[2])
    redis.call('PERSIST', KEYS[4])
    redis.call('PERSIST', KEYS[5])
    redis.call('PERSIST', KEYS[7])
    if previous and previous ~= ARGV[2] then return {cjson.encode(meta), previous} end
    return {cjson.encode(meta), ''}
  `;
  const result = await redis.eval<string[], [string, string]>(
    script,
    [
      K.writerLock,
      K.revision,
      K.current,
      K.snapshotVariants(snapshotId),
      K.snapshotProducts(snapshotId),
      K.snapshotMeta(snapshotId),
      K.snapshotItems(snapshotId),
    ],
    [lockToken, snapshotId, JSON.stringify(meta)],
  );
  const completed = parseJson<SnapshotMeta>(result[0]);
  if (!completed) throw new Error("Redis returned invalid snapshot metadata");
  const previous = result[1];
  if (previous) {
    const pipeline = redis.pipeline();
    for (const key of [
      K.snapshotMeta(previous),
      K.snapshotVariants(previous),
      K.snapshotItems(previous),
      K.snapshotProducts(previous),
    ]) pipeline.expire(key, 7 * 24 * 60 * 60);
    await pipeline.exec();
  }
  return completed;
}

export async function applyInventoryItemVariant(
  expectedSnapshotId: string,
  variant: CachedInventoryVariant,
  verifiedAt: string,
): Promise<number | null> {
  if (!redis) {
    const state = memory();
    if (state.current !== expectedSnapshotId) return null;
    const snapshot = state.snapshots.get(expectedSnapshotId);
    if (!snapshot?.meta) return null;
    const previousId = snapshot.items.get(variant.inventoryItemId);
    const previousVariant = previousId ? snapshot.variants.get(previousId) : null;
    if (
      previousId === variant.variantId &&
      previousVariant &&
      JSON.stringify(previousVariant) === JSON.stringify(variant)
    ) return state.revision;
    if (previousId && previousId !== variant.variantId) snapshot.variants.delete(previousId);
    snapshot.variants.set(variant.variantId, variant);
    snapshot.items.set(variant.inventoryItemId, variant.variantId);
    const productIds = snapshot.products.get(variant.productId) || [];
    if (!productIds.includes(variant.variantId)) productIds.push(variant.variantId);
    snapshot.products.set(variant.productId, productIds);
    state.revision += 1;
    snapshot.meta = {
      ...snapshot.meta,
      revision: state.revision,
      verifiedAt,
      variantCount: snapshot.variants.size,
      productCount: snapshot.products.size,
    };
    return state.revision;
  }
  const script = `
    if redis.call('GET', KEYS[1]) ~= ARGV[1] then return false end
    local oldId = redis.call('HGET', KEYS[4], ARGV[2])
    if oldId == ARGV[3] and redis.call('HGET', KEYS[3], oldId) == ARGV[4] then
      return tonumber(redis.call('GET', KEYS[2]) or '0')
    end
    if oldId and oldId ~= ARGV[3] then redis.call('HDEL', KEYS[3], oldId) end
    redis.call('HSET', KEYS[3], ARGV[3], ARGV[4])
    redis.call('HSET', KEYS[4], ARGV[2], ARGV[3])
    local listRaw = redis.call('HGET', KEYS[5], ARGV[5])
    local ids = listRaw and cjson.decode(listRaw) or {}
    local found = false
    for _, id in ipairs(ids) do if id == ARGV[3] then found = true end end
    if not found then table.insert(ids, ARGV[3]) end
    redis.call('HSET', KEYS[5], ARGV[5], cjson.encode(ids))
    local revision = redis.call('INCR', KEYS[2])
    local meta = cjson.decode(redis.call('GET', KEYS[6]))
    meta['revision'] = revision
    meta['verifiedAt'] = ARGV[6]
    meta['variantCount'] = redis.call('HLEN', KEYS[3])
    meta['productCount'] = redis.call('HLEN', KEYS[5])
    redis.call('SET', KEYS[6], cjson.encode(meta))
    return revision
  `;
  return redis.eval<string[], number | null>(
    script,
    [
      K.current,
      K.revision,
      K.snapshotVariants(expectedSnapshotId),
      K.snapshotItems(expectedSnapshotId),
      K.snapshotProducts(expectedSnapshotId),
      K.snapshotMeta(expectedSnapshotId),
    ],
    [
      expectedSnapshotId,
      variant.inventoryItemId,
      variant.variantId,
      JSON.stringify(variant),
      variant.productId,
      verifiedAt,
    ],
  );
}

export async function replaceProductVariants(
  expectedSnapshotId: string,
  productId: string,
  variants: CachedInventoryVariant[],
  verifiedAt: string,
): Promise<number | null> {
  if (!redis) {
    const state = memory();
    if (state.current !== expectedSnapshotId) return null;
    const snapshot = state.snapshots.get(expectedSnapshotId);
    if (!snapshot?.meta) return null;
    const previousIds = snapshot.products.get(productId) || [];
    const unchanged =
      previousIds.length === variants.length &&
      previousIds.every((id, index) =>
        id === variants[index]?.variantId &&
        JSON.stringify(snapshot.variants.get(id)) === JSON.stringify(variants[index]),
      );
    if (unchanged) return state.revision;
    for (const variantId of previousIds) {
      const previous = snapshot.variants.get(variantId);
      if (previous) snapshot.items.delete(previous.inventoryItemId);
      snapshot.variants.delete(variantId);
    }
    if (variants.length) {
      snapshot.products.set(productId, variants.map((variant) => variant.variantId));
      for (const variant of variants) {
        snapshot.variants.set(variant.variantId, variant);
        snapshot.items.set(variant.inventoryItemId, variant.variantId);
      }
    } else snapshot.products.delete(productId);
    state.revision += 1;
    snapshot.meta = {
      ...snapshot.meta,
      revision: state.revision,
      verifiedAt,
      variantCount: snapshot.variants.size,
      productCount: snapshot.products.size,
    };
    return state.revision;
  }
  const script = `
    if redis.call('GET', KEYS[1]) ~= ARGV[1] then return false end
    local oldRaw = redis.call('HGET', KEYS[5], ARGV[2])
    local oldIds = oldRaw and cjson.decode(oldRaw) or {}
    local count = tonumber(ARGV[4])
    local unchanged = #oldIds == count
    local compareOffset = 5
    if unchanged then
      for i = 1, count do
        if oldIds[i] ~= ARGV[compareOffset] or redis.call('HGET', KEYS[3], oldIds[i]) ~= ARGV[compareOffset + 1] then
          unchanged = false
          break
        end
        compareOffset = compareOffset + 3
      end
    end
    if unchanged then return tonumber(redis.call('GET', KEYS[2]) or '0') end
    if oldRaw then
      for _, id in ipairs(oldIds) do
        local raw = redis.call('HGET', KEYS[3], id)
        if raw then
          local old = cjson.decode(raw)
          if old['inventoryItemId'] then redis.call('HDEL', KEYS[4], old['inventoryItemId']) end
        end
        redis.call('HDEL', KEYS[3], id)
      end
    end
    local ids = {}
    local offset = 5
    for i = 1, count do
      local id = ARGV[offset]
      local raw = ARGV[offset + 1]
      local itemId = ARGV[offset + 2]
      redis.call('HSET', KEYS[3], id, raw)
      redis.call('HSET', KEYS[4], itemId, id)
      table.insert(ids, id)
      offset = offset + 3
    end
    if count == 0 then redis.call('HDEL', KEYS[5], ARGV[2])
    else redis.call('HSET', KEYS[5], ARGV[2], cjson.encode(ids)) end
    local revision = redis.call('INCR', KEYS[2])
    local meta = cjson.decode(redis.call('GET', KEYS[6]))
    meta['revision'] = revision
    meta['verifiedAt'] = ARGV[3]
    meta['variantCount'] = redis.call('HLEN', KEYS[3])
    meta['productCount'] = redis.call('HLEN', KEYS[5])
    redis.call('SET', KEYS[6], cjson.encode(meta))
    return revision
  `;
  const args: (string | number)[] = [
    expectedSnapshotId,
    productId,
    verifiedAt,
    variants.length,
  ];
  for (const variant of variants) {
    args.push(variant.variantId, JSON.stringify(variant), variant.inventoryItemId);
  }
  return redis.eval<(string | number)[], number | null>(
    script,
    [
      K.current,
      K.revision,
      K.snapshotVariants(expectedSnapshotId),
      K.snapshotItems(expectedSnapshotId),
      K.snapshotProducts(expectedSnapshotId),
      K.snapshotMeta(expectedSnapshotId),
    ],
    args,
  );
}

export async function removeInventoryItem(
  expectedSnapshotId: string,
  inventoryItemId: string,
  verifiedAt: string,
): Promise<number | null> {
  if (!redis) {
    const state = memory();
    if (state.current !== expectedSnapshotId) return null;
    const snapshot = state.snapshots.get(expectedSnapshotId);
    if (!snapshot?.meta) return null;
    const variantId = snapshot.items.get(inventoryItemId);
    if (!variantId) return state.revision;
    if (variantId) {
      const variant = snapshot.variants.get(variantId);
      snapshot.items.delete(inventoryItemId);
      snapshot.variants.delete(variantId);
      if (variant) {
        const ids = (snapshot.products.get(variant.productId) || []).filter(
          (id) => id !== variantId,
        );
        if (ids.length) snapshot.products.set(variant.productId, ids);
        else snapshot.products.delete(variant.productId);
      }
    }
    state.revision += 1;
    snapshot.meta = {
      ...snapshot.meta,
      revision: state.revision,
      verifiedAt,
      variantCount: snapshot.variants.size,
      productCount: snapshot.products.size,
    };
    return state.revision;
  }
  const script = `
    if redis.call('GET', KEYS[1]) ~= ARGV[1] then return false end
    local variantId = redis.call('HGET', KEYS[4], ARGV[2])
    if not variantId then return tonumber(redis.call('GET', KEYS[2]) or '0') end
    if variantId then
      local raw = redis.call('HGET', KEYS[3], variantId)
      if raw then
        local variant = cjson.decode(raw)
        local productId = variant['productId']
        local productRaw = redis.call('HGET', KEYS[5], productId)
        if productRaw then
          local nextIds = {}
          for _, id in ipairs(cjson.decode(productRaw)) do
            if id ~= variantId then table.insert(nextIds, id) end
          end
          if #nextIds == 0 then redis.call('HDEL', KEYS[5], productId)
          else redis.call('HSET', KEYS[5], productId, cjson.encode(nextIds)) end
        end
      end
      redis.call('HDEL', KEYS[3], variantId)
      redis.call('HDEL', KEYS[4], ARGV[2])
    end
    local revision = redis.call('INCR', KEYS[2])
    local meta = cjson.decode(redis.call('GET', KEYS[6]))
    meta['revision'] = revision
    meta['verifiedAt'] = ARGV[3]
    meta['variantCount'] = redis.call('HLEN', KEYS[3])
    meta['productCount'] = redis.call('HLEN', KEYS[5])
    redis.call('SET', KEYS[6], cjson.encode(meta))
    return revision
  `;
  return redis.eval<string[], number | null>(
    script,
    [
      K.current,
      K.revision,
      K.snapshotVariants(expectedSnapshotId),
      K.snapshotItems(expectedSnapshotId),
      K.snapshotProducts(expectedSnapshotId),
      K.snapshotMeta(expectedSnapshotId),
    ],
    [expectedSnapshotId, inventoryItemId, verifiedAt],
  );
}

export async function enqueueWebhook(event: QueuedWebhook): Promise<boolean> {
  const ttlSeconds = 48 * 60 * 60;
  if (!redis) {
    const state = memory();
    const now = Date.now();
    for (const [id, expiresAt] of state.dedupe) {
      if (expiresAt <= now) state.dedupe.delete(id);
    }
    if (state.dedupe.has(event.id)) return false;
    state.dedupe.set(event.id, now + ttlSeconds * 1000);
    state.events.set(event.id, event);
    state.ready.unshift(event.id);
    return true;
  }
  const result = await redis.eval<(string | number)[], number>(
    `
      if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
      redis.call('SET', KEYS[1], '1', 'EX', ARGV[1])
      redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
      redis.call('LPUSH', KEYS[3], ARGV[2])
      return 1
    `,
    [K.dedupe(event.id), K.queueEvents, K.queueReady],
    [ttlSeconds, event.id, JSON.stringify(event)],
  );
  return result === 1;
}

export async function claimWebhookBatch(limit = 10): Promise<QueuedWebhook[]> {
  const now = Date.now();
  const visibilityUntil = now + 60_000;
  if (!redis) {
    const state = memory();
    for (const [id, timestamp] of state.inflight) {
      if (timestamp <= now) {
        state.inflight.delete(id);
        state.ready.unshift(id);
      }
    }
    for (const [id, timestamp] of state.retry) {
      if (timestamp <= now) {
        state.retry.delete(id);
        state.ready.unshift(id);
      }
    }
    const events: QueuedWebhook[] = [];
    while (events.length < limit) {
      const id = state.ready.pop();
      if (!id) break;
      const event = state.events.get(id);
      if (!event) continue;
      state.inflight.set(id, visibilityUntil);
      events.push(event);
    }
    return events;
  }
  const script = `
    local expired = redis.call('ZRANGEBYSCORE', KEYS[3], '-inf', ARGV[1], 'LIMIT', 0, ARGV[3])
    for _, id in ipairs(expired) do redis.call('ZREM', KEYS[3], id); redis.call('LPUSH', KEYS[1], id) end
    local due = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[1], 'LIMIT', 0, ARGV[3])
    for _, id in ipairs(due) do redis.call('ZREM', KEYS[2], id); redis.call('LPUSH', KEYS[1], id) end
    local output = {}
    for i = 1, tonumber(ARGV[3]) do
      local id = redis.call('RPOP', KEYS[1])
      if not id then break end
      local raw = redis.call('HGET', KEYS[4], id)
      if raw then
        redis.call('ZADD', KEYS[3], ARGV[2], id)
        table.insert(output, raw)
      end
    end
    return output
  `;
  const values = await redis.eval<number[], string[]>(
    script,
    [K.queueReady, K.queueRetry, K.queueInflight, K.queueEvents],
    [now, visibilityUntil, limit],
  );
  return values
    .map((value) => parseJson<QueuedWebhook>(value))
    .filter((value): value is QueuedWebhook => Boolean(value));
}

export async function completeWebhook(id: string): Promise<void> {
  if (!redis) {
    const state = memory();
    state.inflight.delete(id);
    state.events.delete(id);
    return;
  }
  const transaction = redis.multi();
  transaction.zrem(K.queueInflight, id);
  transaction.hdel(K.queueEvents, id);
  await transaction.exec();
}

export async function releaseWebhook(id: string): Promise<void> {
  if (!redis) {
    const state = memory();
    state.inflight.delete(id);
    if (state.events.has(id)) state.ready.unshift(id);
    return;
  }
  await redis.eval(
    `
      redis.call('ZREM', KEYS[1], ARGV[1])
      if redis.call('HEXISTS', KEYS[2], ARGV[1]) == 1 then
        redis.call('LPUSH', KEYS[3], ARGV[1])
      end
      return 1
    `,
    [K.queueInflight, K.queueEvents, K.queueReady],
    [id],
  );
}

export async function retryWebhook(
  event: QueuedWebhook,
  error: string,
): Promise<void> {
  const next = { ...event, attempts: event.attempts + 1 };
  if (next.attempts >= 8) {
    const dead = { ...next, payload: { ...next.payload, _lastError: error.slice(0, 500) } };
    if (!redis) {
      const state = memory();
      state.inflight.delete(event.id);
      state.events.delete(event.id);
      state.dead.unshift(dead);
      return;
    }
    const transaction = redis.multi();
    transaction.zrem(K.queueInflight, event.id);
    transaction.hdel(K.queueEvents, event.id);
    transaction.lpush(K.queueDead, JSON.stringify(dead));
    transaction.ltrim(K.queueDead, 0, 199);
    await transaction.exec();
    return;
  }
  const delayMs = Math.min(15 * 60_000, 2 ** next.attempts * 5_000);
  const availableAt = Date.now() + delayMs;
  if (!redis) {
    const state = memory();
    state.inflight.delete(event.id);
    state.events.set(event.id, next);
    state.retry.set(event.id, availableAt);
    return;
  }
  const transaction = redis.multi();
  transaction.zrem(K.queueInflight, event.id);
  transaction.hset(K.queueEvents, { [event.id]: JSON.stringify(next) });
  transaction.zadd(K.queueRetry, { score: availableAt, member: event.id });
  await transaction.exec();
}

export async function getQueueStats(): Promise<QueueStats> {
  if (!redis) {
    const state = memory();
    const oldest = [...state.events.values()].sort((a, b) =>
      a.receivedAt.localeCompare(b.receivedAt),
    )[0];
    return {
      ready: state.ready.length,
      retry: state.retry.size,
      dead: state.dead.length,
      oldestReceivedAt: oldest?.receivedAt || null,
    };
  }
  const pipeline = redis.pipeline();
  pipeline.llen(K.queueReady);
  pipeline.zcard(K.queueRetry);
  pipeline.llen(K.queueDead);
  pipeline.hvals(K.queueEvents);
  const [ready, retry, dead, rawEvents] = (await pipeline.exec()) as [
    number,
    number,
    number,
    string[],
  ];
  const oldest = (rawEvents || [])
    .map((value) => parseJson<QueuedWebhook>(value))
    .filter((value): value is QueuedWebhook => Boolean(value))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))[0];
  return { ready, retry, dead, oldestReceivedAt: oldest?.receivedAt || null };
}

export async function buildDiagnostics(
  configuredShop: string | null,
  apiVersion: string,
  webhookTopics: Diagnostics["webhookTopics"],
): Promise<Diagnostics> {
  const [snapshot, status, queue] = await Promise.all([
    getSnapshotMeta(),
    getSyncStatus(),
    getQueueStats(),
  ]);
  return {
    backend: backendName(),
    productionReady: Boolean(redis),
    snapshot,
    status,
    queue,
    configuredShop,
    apiVersion,
    webhookTopics,
  };
}

export function resetMemoryStoreForTests(): void {
  globalMemory.__footmbInventoryMemory = undefined;
}
