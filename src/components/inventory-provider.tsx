"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  groupVariants, getStats, type InventoryVariant, type Product, type ShopifyPage,
} from "@/lib/inventory";

type Store = {
  products: Product[];
  stats: ReturnType<typeof getStats>;
  syncing: boolean;
  ready: boolean;
  progress: number;
  error: string | null;
  syncedAt: Date | null;
  refresh: () => void;
};

const Context = createContext<Store | null>(null);

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

async function fetchOne(cursor: string | null, signal: AbortSignal): Promise<ShopifyPage> {
  const url = cursor
    ? `/api/inventory?${new URLSearchParams({ cursor }).toString()}`
    : "/api/inventory";

  for (let attempt = 0; attempt < 5; attempt++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin", // Send Auth.js session cookie.
        signal,
      });

      if (response.status === 401) {
        throw new Error("Session expirée. Reconnectez-vous via /login.");
      }
      if (RETRY_STATUSES.has(response.status) && attempt < 4) {
        await wait(Math.min(1200 * 2 ** attempt, 6000), signal);
        continue;
      }

      let body: ShopifyPage;
      try {
        body = (await response.json()) as ShopifyPage;
      } catch {
        throw new Error(`Réponse du serveur invalide (${response.status})`);
      }
      if (!response.ok || !body.success) {
        throw new Error(body.error || `Erreur Shopify (${response.status})`);
      }
      if (!Array.isArray(body.variants) || !body.pageInfo) {
        throw new Error("Données d'inventaire incomplètes");
      }
      return body;
    } catch (error) {
      if (signal.aborted) throw error;
      const message = error instanceof Error ? error.message : "Erreur de connexion";
      const networkError =
        error instanceof TypeError ||
        /Failed to fetch|NetworkError|Load failed/i.test(message);
      if (networkError && attempt < 4) {
        await wait(Math.min(1200 * 2 ** attempt, 6000), signal);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Connexion instable ou limite Shopify atteinte. Réessayez.");
}

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [syncing, setSyncing] = useState(true);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      setSyncing(true);
      setError(null);
      setProgress(0);
      try {
        const accumulated: InventoryVariant[] = [];
        const seenCursors = new Set<string>();
        let cursor: string | null = null;
        let lastReported = 0;

        for (let i = 0; i < 500; i++) {
          const page = await fetchOne(cursor, controller.signal);
          if (controller.signal.aborted) return;
          accumulated.push(...page.variants);

          // Avoid re-rendering the full app for every 20-variant page.
          if (accumulated.length - lastReported >= 100 || !page.pageInfo.hasNextPage) {
            lastReported = accumulated.length;
            setProgress(lastReported);
          }

          if (!page.pageInfo.hasNextPage) {
            const grouped = groupVariants(accumulated);
            if (controller.signal.aborted) return;
            setProducts(grouped);
            setReady(true);
            setSyncedAt(new Date());
            return;
          }

          const nextCursor = page.pageInfo.endCursor;
          if (!nextCursor || seenCursors.has(nextCursor)) {
            throw new Error("La pagination Shopify s'est arrêtée inopinément");
          }
          seenCursors.add(nextCursor);
          cursor = nextCursor;
        }
        throw new Error("Limite de synchronisation atteinte");
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Erreur de synchronisation");
        }
      } finally {
        if (!controller.signal.aborted) setSyncing(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [refreshKey]);

  const refresh = useCallback(() => {
    if (!syncing) setRefreshKey((old) => old + 1);
  }, [syncing]);

  const stats = useMemo(() => getStats(products), [products]);
  const value = useMemo(
    () => ({ products, stats, syncing, ready, progress, error, syncedAt, refresh }),
    [products, stats, syncing, ready, progress, error, syncedAt, refresh]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useInventory() {
  const value = useContext(Context);
  if (!value) throw new Error("useInventory must be inside InventoryProvider");
  return value;
}
