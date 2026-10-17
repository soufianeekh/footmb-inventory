"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  groupVariants,
  getStats,
  type InventoryVariant,
  type Product,
  type ShopifyPage,
} from "@/lib/inventory";
import {
  getInventoryPollDelay,
  INVENTORY_POLL_INTERVAL_MS,
  shouldCheckInventoryVersion,
  shouldRefreshInventory,
} from "@/lib/sync/client-poll";

type SyncPhase = "empty" | "syncing" | "ready" | "degraded" | "error";

type Store = {
  variants: InventoryVariant[];
  products: Product[];
  stats: ReturnType<typeof getStats>;
  syncing: boolean;
  ready: boolean;
  progress: number;
  error: string | null;
  syncedAt: Date | null;
  reconciledAt: Date | null;
  revision: number;
  syncPhase: SyncPhase;
  refresh: () => void;
};

const Context = createContext<Store | null>(null);
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function readJson(response: Response): Promise<ShopifyPage> {
  try {
    return (await response.json()) as ShopifyPage;
  } catch {
    throw new Error(`Réponse du serveur invalide (${response.status})`);
  }
}

async function fetchSnapshot(
  signal: AbortSignal,
  onProgress: (count: number) => void,
): Promise<ShopifyPage> {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const response = await fetch("/api/inventory", {
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
    if (response.status === 401) {
      throw new Error("Session expirée. Reconnectez-vous via /login.");
    }
    const body = await readJson(response);
    if (response.status === 202 && body.initializing) {
      onProgress(body.sync?.processedVariants || 0);
      await wait(2_000, signal);
      continue;
    }
    if (RETRY_STATUSES.has(response.status) && attempt < 4) {
      await wait(Math.min(800 * 2 ** attempt, 5_000), signal);
      continue;
    }
    if (!response.ok || !body.success) {
      throw new Error(body.error || `Erreur d’inventaire (${response.status})`);
    }
    if (!Array.isArray(body.variants) || !body.meta) {
      throw new Error("Instantané d’inventaire incomplet");
    }
    return body;
  }
  throw new Error("La synchronisation initiale prend plus de temps que prévu.");
}

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [variants, setVariants] = useState<InventoryVariant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [syncing, setSyncing] = useState(true);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [reconciledAt, setReconciledAt] = useState<Date | null>(null);
  const [revision, setRevision] = useState(0);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("empty");
  const loadingRef = useRef(false);
  const mountedRef = useRef(false);
  const readyRef = useRef(false);
  const revisionRef = useRef(0);
  const syncPhaseRef = useRef<SyncPhase>("empty");
  const errorRef = useRef<string | null>(null);
  const snapshotControllerRef = useRef<AbortController | null>(null);

  const loadSnapshot = useCallback(async (foreground: boolean) => {
    if (loadingRef.current) return false;
    const controller = new AbortController();
    snapshotControllerRef.current = controller;
    loadingRef.current = true;
    const announceLoading = foreground || !readyRef.current;
    if (announceLoading && mountedRef.current) {
      setSyncing(true);
    }
    if (foreground && errorRef.current && mountedRef.current) {
      errorRef.current = null;
      setError(null);
    }
    try {
      const snapshot = await fetchSnapshot(controller.signal, (count) => {
        if (mountedRef.current && !readyRef.current) setProgress(count);
      });
      if (controller.signal.aborted || !mountedRef.current) return false;
      const nextRevision = snapshot.meta?.revision || snapshot.revision || 0;
      const inventoryChanged = !readyRef.current || nextRevision > revisionRef.current;
      if (inventoryChanged) {
        setVariants(snapshot.variants);
        setProducts(groupVariants(snapshot.variants));
        setProgress(snapshot.variants.length);
        setRevision(nextRevision);
        revisionRef.current = nextRevision;
        setSyncedAt(snapshot.meta?.verifiedAt ? new Date(snapshot.meta.verifiedAt) : new Date());
        setReconciledAt(
          snapshot.meta?.reconciledAt ? new Date(snapshot.meta.reconciledAt) : null,
        );
      }
      const nextPhase = snapshot.sync?.phase || "ready";
      if (nextPhase !== syncPhaseRef.current) {
        syncPhaseRef.current = nextPhase;
        setSyncPhase(nextPhase);
      }
      if (errorRef.current) {
        errorRef.current = null;
        setError(null);
      }
      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
      }
      return true;
    } catch (caught) {
      if (!controller.signal.aborted && mountedRef.current) {
        const nextError =
          caught instanceof Error ? caught.message : "Erreur de synchronisation";
        if (nextError !== errorRef.current) {
          errorRef.current = nextError;
          setError(nextError);
        }
        if (syncPhaseRef.current !== "error") {
          syncPhaseRef.current = "error";
          setSyncPhase("error");
        }
      }
      return false;
    } finally {
      if (snapshotControllerRef.current === controller) {
        snapshotControllerRef.current = null;
        loadingRef.current = false;
        if (announceLoading && mountedRef.current) setSyncing(false);
      }
    }
  }, []);

  const refresh = useCallback(() => {
    void loadSnapshot(true);
  }, [loadSnapshot]);

  useEffect(() => {
    mountedRef.current = true;
    void loadSnapshot(true);
    return () => {
      mountedRef.current = false;
      snapshotControllerRef.current?.abort();
      snapshotControllerRef.current = null;
      loadingRef.current = false;
    };
  }, [loadSnapshot]);

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let checking = false;
    let consecutiveFailures = 0;

    const schedule = (delay: number) => {
      if (stopped) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void check(), delay);
    };

    const check = async () => {
      if (stopped || checking) return;
      if (!shouldCheckInventoryVersion(document.visibilityState, loadingRef.current)) {
        schedule(getInventoryPollDelay(consecutiveFailures, document.visibilityState));
        return;
      }
      checking = true;
      controller = new AbortController();
      try {
        const response = await fetch(
          `/api/inventory/version?since=${revisionRef.current}`,
          {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error(`Version check failed (${response.status})`);
        const body = (await response.json()) as {
          revision?: number;
          changed?: boolean;
          sync?: { phase?: SyncPhase; error?: string | null };
        };
        consecutiveFailures = 0;
        if (body.sync?.phase && body.sync.phase !== syncPhaseRef.current) {
          syncPhaseRef.current = body.sync.phase;
          setSyncPhase(body.sync.phase);
        }
        const nextError = body.sync?.error || null;
        if (nextError !== errorRef.current) {
          errorRef.current = nextError;
          setError(nextError);
        }
        const remoteRevision = body.revision || 0;
        if (
          body.changed === true &&
          shouldRefreshInventory(remoteRevision, revisionRef.current) &&
          remoteRevision > revisionRef.current
        ) {
          await loadSnapshot(false);
        }
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          consecutiveFailures += 1;
        }
      } finally {
        checking = false;
        controller = null;
        schedule(getInventoryPollDelay(consecutiveFailures, document.visibilityState));
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        schedule(0);
      } else {
        controller?.abort();
        schedule(getInventoryPollDelay(consecutiveFailures, "hidden"));
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule(INVENTORY_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      controller?.abort();
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadSnapshot]);

  const stats = useMemo(() => getStats(products), [products]);
  const value = useMemo(
    () => ({
      variants,
      products,
      stats,
      syncing,
      ready,
      progress,
      error,
      syncedAt,
      reconciledAt,
      revision,
      syncPhase,
      refresh,
    }),
    [
      variants,
      products,
      stats,
      syncing,
      ready,
      progress,
      error,
      syncedAt,
      reconciledAt,
      revision,
      syncPhase,
      refresh,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useInventory() {
  const value = useContext(Context);
  if (!value) throw new Error("useInventory must be inside InventoryProvider");
  return value;
}
