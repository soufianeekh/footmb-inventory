export type LocationKey = "casa" | "tanger" | "stockCasa";
export type LocationFilter = LocationKey | "all" | "out" | "low";
export type SortKey = "name" | "most" | "least";
export type StockItem = { size: string; quantity: number };

export type InventoryVariant = {
  variantId: string;
  productId: string;
  model: string;
  image: string | null;
  size: string;
  sku?: string | null;
  barcode?: string | null;
  tracked: boolean;
  locationsComplete: boolean;
  stock: Record<LocationKey, number>;
  inventoryItemId?: string;
  locationIds?: Partial<Record<LocationKey, string>>;
  sourceUpdatedAt?: string;
};

export type ShopifyPage = {
  success: boolean;
  variants: InventoryVariant[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  revision?: number;
  initializing?: boolean;
  meta?: {
    revision: number;
    verifiedAt: string;
    reconciledAt: string;
    publishedAt: string;
  };
  sync?: {
    phase: "empty" | "syncing" | "ready" | "degraded" | "error";
    processedVariants: number;
    message: string | null;
    error: string | null;
  };
  error?: string;
};

export type Product = {
  id: string;
  slug: string;
  model: string;
  image: string | null;
  sizes: Record<LocationKey, StockItem[]>;
  units: Record<LocationKey, number>;
  total: number;
  trackedVariants: number;
  untrackedVariants: number;
  locationsComplete: boolean;
};

type Draft = {
  id: string;
  model: string;
  image: string | null;
  quantities: Record<LocationKey, Map<string, number>>;
  trackedVariants: number;
  untrackedVariants: number;
  locationsComplete: boolean;
};

export const LOCATIONS: { key: LocationKey; label: string; short: string }[] = [
  { key: "casa", label: "Casablanca", short: "Casa" },
  { key: "tanger", label: "Tanger", short: "Tanger" },
  { key: "stockCasa", label: "Stock Casa", short: "Stock Casa" },
];
export const LOCATION_KEYS: LocationKey[] = ["casa", "tanger", "stockCasa"];

export const fmt = (value: number) => new Intl.NumberFormat("fr-FR").format(value);
export const safeQty = (qty: number) => Math.max(0, Number(qty) || 0);

function normalizeSize(value?: string) {
  return !value || value === "Default Title" ? "Standard" : value.trim();
}

export function groupVariants(variants: InventoryVariant[]): Product[] {
  const drafts = new Map<string, Draft>();
  // Variants are keyed by ID, avoiding double-counts from repeated API pages.
  const seen = new Set<string>();
  for (const variant of variants) {
    if (seen.has(variant.variantId)) continue;
    seen.add(variant.variantId);
    let draft = drafts.get(variant.productId);
    if (!draft) {
      draft = {
        id: variant.productId,
        model: variant.model,
        image: variant.image,
        quantities: { casa: new Map(), tanger: new Map(), stockCasa: new Map() },
        trackedVariants: 0,
        untrackedVariants: 0,
        locationsComplete: true,
      };
      drafts.set(variant.productId, draft);
    }
    if (!draft.image && variant.image) draft.image = variant.image;
    if (!variant.tracked) {
      draft.untrackedVariants += 1;
      continue;
    }
    draft.trackedVariants += 1;
    if (!variant.locationsComplete) draft.locationsComplete = false;
    const size = normalizeSize(variant.size);
    for (const key of LOCATION_KEYS) {
      const quantity = safeQty(variant.stock?.[key]);
      if (quantity > 0) {
        draft.quantities[key].set(size, (draft.quantities[key].get(size) ?? 0) + quantity);
      }
    }
  }

  return Array.from(drafts.values()).map((draft) => {
    const sizes = {} as Record<LocationKey, StockItem[]>;
    const units = {} as Record<LocationKey, number>;
    for (const key of LOCATION_KEYS) {
      sizes[key] = Array.from(draft.quantities[key], ([size, quantity]) => ({
        size, quantity,
      })).sort((a, b) => a.size.localeCompare(b.size, "fr", { numeric: true }));
      units[key] = sizes[key].reduce((total, item) => total + item.quantity, 0);
    }
    return {
      id: draft.id,
      slug: draft.id.split("/").pop() || draft.id,
      model: draft.model,
      image: draft.image,
      sizes,
      units,
      total: units.casa + units.tanger + units.stockCasa,
      trackedVariants: draft.trackedVariants,
      untrackedVariants: draft.untrackedVariants,
      locationsComplete: draft.locationsComplete,
    };
  }).sort((a, b) => a.model.localeCompare(b.model, "fr", { numeric: true }));
}

export const isKnown = (product: Product) =>
  product.trackedVariants > 0 && product.untrackedVariants === 0 && product.locationsComplete;
export const isOut = (product: Product) => isKnown(product) && product.total === 0;
export const isLow = (product: Product) => isKnown(product) && product.total > 0 && product.total <= 3;

export function getStats(products: Product[]) {
  const units = { casa: 0, tanger: 0, stockCasa: 0 };
  let out = 0, low = 0, uncertain = 0;
  for (const product of products) {
    for (const key of LOCATION_KEYS) units[key] += product.units[key];
    if (isOut(product)) out++;
    if (isLow(product)) low++;
    if (!isKnown(product)) uncertain++;
  }
  return {
    models: products.length,
    total: units.casa + units.tanger + units.stockCasa,
    units, out, low, uncertain,
  };
}

export function formatSync(time: Date | null) {
  return time ? time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";
}
