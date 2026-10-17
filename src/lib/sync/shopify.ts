import type { LocationKey } from "../inventory";
import {
  DEFAULT_LOCATION_NAMES,
  LOCATION_ID_ENV,
  SHOPIFY_API_VERSION,
  configuredShop,
} from "./config";
import type { CachedInventoryVariant, InventoryLocation } from "./types";

type GraphQLError = { message?: string; extensions?: { code?: string } };
type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLError[];
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable?: number; restoreRate?: number } } };
};

type ShopifyLevel = {
  location: { id: string; name: string };
  quantities: { name: string; quantity: number }[];
};

type ShopifyVariant = {
  id: string;
  title: string;
  sku?: string | null;
  barcode?: string | null;
  updatedAt?: string;
  selectedOptions: { name: string; value: string }[];
  product: {
    id: string;
    title: string;
    updatedAt?: string;
    featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  };
  inventoryItem: {
    id: string;
    tracked: boolean;
    updatedAt?: string;
    inventoryLevels: {
      nodes: ShopifyLevel[];
      pageInfo: { hasNextPage: boolean; endCursor?: string | null };
    };
  };
};

let tokenCache: { token: string; expiresAt: number } | null = null;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const response = await fetch(`https://${configuredShop()}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SHOPIFY_CLIENT_ID || "",
      client_secret: process.env.SHOPIFY_CLIENT_SECRET || "",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Shopify authentication failed (${response.status})`);
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Shopify did not return an access token");
  const lifetime = Number(data.expires_in) || 3600;
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, lifetime - 60) * 1000,
  };
  return tokenCache.token;
}

export async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = await getAccessToken();
    const response = await fetch(
      `https://${configuredShop()}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
      },
    );
    if (response.status === 401) tokenCache = null;
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 4) throw new Error(`Shopify unavailable (${response.status})`);
      const retryAfter = Number(response.headers.get("retry-after"));
      await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * 2 ** attempt);
      continue;
    }
    if (!response.ok) throw new Error(`Shopify GraphQL failed (${response.status})`);
    const body = (await response.json()) as GraphQLResponse<T>;
    const throttled = body.errors?.some((error) => error.extensions?.code === "THROTTLED");
    if (throttled && attempt < 4) {
      const throttle = body.extensions?.cost?.throttleStatus;
      const waitMs = throttle?.restoreRate
        ? Math.max(250, Math.ceil((100 - (throttle.currentlyAvailable || 0)) / throttle.restoreRate) * 1000)
        : 500 * 2 ** attempt;
      await delay(Math.min(waitMs, 5000));
      continue;
    }
    if (body.errors?.length) {
      throw new Error(body.errors.map((error) => error.message || "GraphQL error").join("; "));
    }
    if (!body.data) throw new Error("Shopify returned no data");
    return body.data;
  }
  throw new Error("Shopify request retry limit reached");
}

const LOCATION_QUERY = `query InventoryLocations($cursor: String) {
  locations(first: 100, after: $cursor, includeInactive: false) {
    pageInfo { hasNextPage endCursor }
    nodes { id name }
  }
}`;

export async function fetchLocations(): Promise<InventoryLocation[]> {
  const all: { id: string; name: string }[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 25; page++) {
    const data: {
      locations: {
        nodes: { id: string; name: string }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await shopifyGraphQL(LOCATION_QUERY, { cursor });
    all.push(...data.locations.nodes);
    if (!data.locations.pageInfo.hasNextPage) break;
    cursor = data.locations.pageInfo.endCursor;
    if (!cursor) throw new Error("Shopify location pagination stopped unexpectedly");
  }
  const keys: LocationKey[] = ["casa", "tanger", "stockCasa"];
  return keys.map((key) => {
    const configuredId = LOCATION_ID_ENV[key];
    const match = configuredId
      ? all.find((location) => location.id === configuredId || location.id.endsWith(`/${configuredId}`))
      : all.find((location) => location.name === DEFAULT_LOCATION_NAMES[key]);
    if (!match) {
      throw new Error(
        `Required Shopify location not found for ${key}. Configure SHOPIFY_LOCATION_${key === "stockCasa" ? "STOCK_CASA" : key.toUpperCase()}_ID.`,
      );
    }
    return { key, id: match.id, name: match.name };
  });
}

const VARIANT_FIELDS = `
  id title sku barcode updatedAt selectedOptions { name value }
  product { id title updatedAt featuredMedia { preview { image { url } } } }
  inventoryItem {
    id tracked updatedAt
    inventoryLevels(first: 100, includeInactive: false) {
      pageInfo { hasNextPage endCursor }
      nodes { location { id name } quantities(names: ["available"]) { name quantity } }
    }
  }
`;

const VARIANTS_PAGE_QUERY = `query InventoryVariants($cursor: String) {
  productVariants(first: 100, after: $cursor, sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes { ${VARIANT_FIELDS} }
  }
}`;

export type ShopifyVariantPage = {
  variants: CachedInventoryVariant[];
  hasNextPage: boolean;
  endCursor: string | null;
};

export type UpdatedInventoryItemPage = ShopifyVariantPage & {
  removedInventoryItemIds: string[];
};

function quantity(level: ShopifyLevel): number {
  return level.quantities.find((entry) => entry.name === "available")?.quantity ?? 0;
}

export function mapShopifyVariant(
  variant: ShopifyVariant,
  locations: InventoryLocation[],
): CachedInventoryVariant {
  const size =
    variant.selectedOptions.find((option) => /^(size|taille|pointure)$/i.test(option.name))?.value ||
    variant.title;
  const stock = { casa: 0, tanger: 0, stockCasa: 0 };
  const locationIds: CachedInventoryVariant["locationIds"] = {};
  for (const location of locations) {
    const level = variant.inventoryItem.inventoryLevels.nodes.find(
      (candidate) => candidate.location.id === location.id,
    );
    stock[location.key] = level ? quantity(level) : 0;
    locationIds[location.key] = location.id;
  }
  return {
    variantId: variant.id,
    productId: variant.product.id,
    inventoryItemId: variant.inventoryItem.id,
    model: variant.product.title,
    image: variant.product.featuredMedia?.preview?.image?.url ?? null,
    size,
    sku: variant.sku || null,
    barcode: variant.barcode || null,
    tracked: variant.inventoryItem.tracked,
    locationsComplete: !variant.inventoryItem.inventoryLevels.pageInfo.hasNextPage,
    stock,
    locationIds,
    sourceUpdatedAt:
      variant.inventoryItem.updatedAt || variant.updatedAt || variant.product.updatedAt || new Date().toISOString(),
  };
}

export async function fetchVariantPage(
  cursor: string | null,
  locations: InventoryLocation[],
): Promise<ShopifyVariantPage> {
  const data = await shopifyGraphQL<{
    productVariants: {
      nodes: ShopifyVariant[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(VARIANTS_PAGE_QUERY, { cursor });
  const incomplete = data.productVariants.nodes.find(
    (variant) => variant.inventoryItem.inventoryLevels.pageInfo.hasNextPage,
  );
  if (incomplete) {
    throw new Error(
      `Inventory item ${incomplete.inventoryItem.id} has more than 100 locations; configure a dedicated location query before publishing.`,
    );
  }
  return {
    variants: data.productVariants.nodes.map((variant) => mapShopifyVariant(variant, locations)),
    hasNextPage: data.productVariants.pageInfo.hasNextPage,
    endCursor: data.productVariants.pageInfo.endCursor,
  };
}

const INVENTORY_ITEM_QUERY = `query InventoryItem($id: ID!) {
  inventoryItem(id: $id) {
    id tracked updatedAt
    inventoryLevels(first: 100, includeInactive: false) {
      pageInfo { hasNextPage endCursor }
      nodes { location { id name } quantities(names: ["available"]) { name quantity } }
    }
    variants(first: 1) {
      nodes {
        id title sku barcode updatedAt selectedOptions { name value }
        product { id title updatedAt featuredMedia { preview { image { url } } } }
      }
    }
  }
}`;

export async function fetchInventoryItemVariant(
  inventoryItemId: string,
  locations: InventoryLocation[],
): Promise<CachedInventoryVariant | null> {
  const data = await shopifyGraphQL<{
    inventoryItem: null | {
      id: string;
      tracked: boolean;
      updatedAt: string;
      inventoryLevels: ShopifyVariant["inventoryItem"]["inventoryLevels"];
      variants: { nodes: Omit<ShopifyVariant, "inventoryItem">[] };
    };
  }>(INVENTORY_ITEM_QUERY, { id: inventoryItemId });
  if (!data.inventoryItem) return null;
  if (data.inventoryItem.inventoryLevels.pageInfo.hasNextPage) {
    throw new Error(`Inventory item ${inventoryItemId} has more than 100 locations`);
  }
  const variant = data.inventoryItem.variants.nodes[0];
  if (!variant) return null;
  return mapShopifyVariant(
    { ...variant, inventoryItem: data.inventoryItem },
    locations,
  );
}

const UPDATED_INVENTORY_ITEMS_QUERY = `query UpdatedInventoryItems($cursor: String, $query: String!) {
  inventoryItems(first: 100, after: $cursor, query: $query, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id tracked updatedAt
      inventoryLevels(first: 100, includeInactive: false) {
        pageInfo { hasNextPage endCursor }
        nodes { location { id name } quantities(names: ["available"]) { name quantity } }
      }
      variants(first: 1) {
        nodes {
          id title sku barcode updatedAt selectedOptions { name value }
          product { id title updatedAt featuredMedia { preview { image { url } } } }
        }
      }
    }
  }
}`;

export async function fetchUpdatedInventoryItemPage(
  cursor: string | null,
  locations: InventoryLocation[],
  since: string,
  until: string,
): Promise<UpdatedInventoryItemPage> {
  const data = await shopifyGraphQL<{
    inventoryItems: {
      nodes: Array<{
        id: string;
        tracked: boolean;
        updatedAt: string;
        inventoryLevels: ShopifyVariant["inventoryItem"]["inventoryLevels"];
        variants: { nodes: Omit<ShopifyVariant, "inventoryItem">[] };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(UPDATED_INVENTORY_ITEMS_QUERY, {
    cursor,
    query: `updated_at:>='${since}' updated_at:<='${until}'`,
  });
  const variants: CachedInventoryVariant[] = [];
  const removedInventoryItemIds: string[] = [];
  for (const item of data.inventoryItems.nodes) {
    if (item.inventoryLevels.pageInfo.hasNextPage) {
      throw new Error(`Inventory item ${item.id} has more than 100 locations`);
    }
    const variant = item.variants.nodes[0];
    if (variant) variants.push(mapShopifyVariant({ ...variant, inventoryItem: item }, locations));
    else removedInventoryItemIds.push(item.id);
  }
  return {
    variants,
    hasNextPage: data.inventoryItems.pageInfo.hasNextPage,
    endCursor: data.inventoryItems.pageInfo.endCursor,
    removedInventoryItemIds,
  };
}

const PRODUCT_QUERY = `query InventoryProduct($id: ID!, $cursor: String) {
  product(id: $id) {
    id
    variants(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { ${VARIANT_FIELDS} }
    }
  }
}`;

export async function fetchProductVariants(
  productId: string,
  locations: InventoryLocation[],
): Promise<CachedInventoryVariant[] | null> {
  const variants: CachedInventoryVariant[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const data: {
      product: null | {
        variants: {
          nodes: ShopifyVariant[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    } = await shopifyGraphQL(PRODUCT_QUERY, { id: productId, cursor });
    if (!data.product) return null;
    for (const variant of data.product.variants.nodes) {
      if (variant.inventoryItem.inventoryLevels.pageInfo.hasNextPage) {
        throw new Error(`Inventory item ${variant.inventoryItem.id} has more than 100 locations`);
      }
      variants.push(mapShopifyVariant(variant, locations));
    }
    if (!data.product.variants.pageInfo.hasNextPage) return variants;
    cursor = data.product.variants.pageInfo.endCursor;
    if (!cursor) throw new Error("Shopify product pagination stopped unexpectedly");
  }
  throw new Error("Shopify product variant page limit reached");
}

const ADJUST_INVENTORY_QUERY = `mutation AdjustInventory($input: InventoryAdjustQuantitiesInput!, $idempotencyKey: String!) {
  inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) {
    userErrors { field message }
    inventoryAdjustmentGroup {
      createdAt
      reason
      referenceDocumentUri
      changes { name delta quantityAfterChange }
    }
  }
}`;

export type InventoryAdjustment = {
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  currentQuantity: number;
};

export async function adjustInventoryQuantities(
  operationId: string,
  changes: InventoryAdjustment[],
): Promise<{ createdAt: string; quantitiesAfter: number[] }> {
  const data = await shopifyGraphQL<{
    inventoryAdjustQuantities: {
      userErrors: Array<{ field: string[] | null; message: string }>;
      inventoryAdjustmentGroup: null | {
        createdAt: string;
        changes: Array<{ name: string; delta: number; quantityAfterChange: number | null }>;
      };
    };
  }>(ADJUST_INVENTORY_QUERY, {
    idempotencyKey: operationId,
    input: {
      reason: "correction",
      name: "available",
      referenceDocumentUri: `footmb://sale/${operationId}`,
      changes: changes.map((change) => ({
        delta: -change.quantity,
        inventoryItemId: change.inventoryItemId,
        locationId: change.locationId,
        changeFromQuantity: change.currentQuantity,
      })),
    },
  });
  const result = data.inventoryAdjustQuantities;
  if (result.userErrors.length) {
    throw new Error(result.userErrors.map((error) => error.message).join("; "));
  }
  if (!result.inventoryAdjustmentGroup) throw new Error("Shopify did not create an inventory adjustment");
  return {
    createdAt: result.inventoryAdjustmentGroup.createdAt,
    quantitiesAfter: result.inventoryAdjustmentGroup.changes
      .filter((change) => change.name === "available")
      .map((change) => change.quantityAfterChange ?? 0),
  };
}

const ORDERS_STATS_QUERY = `query SalesOrders($cursor: String, $query: String!) {
  orders(first: 100, after: $cursor, sortKey: CREATED_AT, reverse: true, query: $query) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id createdAt sourceName cancelledAt
      lineItems(first: 100) { nodes { quantity currentQuantity } }
    }
  }
}`;

export type ShopifySaleSummary = {
  id: string;
  createdAt: string;
  source: "site" | "shopify_pos";
  units: number;
};

export async function fetchShopifySaleSummaries(since: string): Promise<ShopifySaleSummary[]> {
  const sales: ShopifySaleSummary[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 25; page += 1) {
    const data: {
      orders: {
        nodes: Array<{
          id: string;
          createdAt: string;
          sourceName: string | null;
          cancelledAt: string | null;
          lineItems: { nodes: Array<{ quantity: number; currentQuantity: number }> };
        }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await shopifyGraphQL(ORDERS_STATS_QUERY, {
      cursor,
      query: `created_at:>='${since}' status:any`,
    });
    for (const order of data.orders.nodes) {
      if (order.cancelledAt) continue;
      sales.push({
        id: order.id,
        createdAt: order.createdAt,
        source: order.sourceName === "pos" ? "shopify_pos" : "site",
        units: order.lineItems.nodes.reduce((sum, line) => sum + Math.max(0, line.currentQuantity ?? line.quantity), 0),
      });
    }
    if (!data.orders.pageInfo.hasNextPage) return sales;
    cursor = data.orders.pageInfo.endCursor;
    if (!cursor) throw new Error("Shopify order pagination returned no cursor");
  }
  throw new Error("Shopify order page limit reached");
}

export function resetShopifyTokenForTests() {
  tokenCache = null;
}
