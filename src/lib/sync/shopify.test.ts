import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adjustInventoryQuantities,
  fetchUpdatedInventoryItemPage,
  mapShopifyVariant,
  resetShopifyTokenForTests,
} from "./shopify";
import type { InventoryLocation } from "./types";

const locations: InventoryLocation[] = [
  { key: "casa", id: "loc-1", name: "FOOTMB Casablanca" },
  { key: "tanger", id: "loc-2", name: "FOOTMB Tanger" },
  { key: "stockCasa", id: "loc-3", name: "Stock Casa" },
];

describe("Shopify inventory mapping", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetShopifyTokenForTests();
  });
  it("maps by stable location id even when names change", () => {
    const mapped = mapShopifyVariant(
      {
        id: "variant-1",
        title: "M",
        selectedOptions: [{ name: "Taille", value: "M" }],
        product: { id: "product-1", title: "Maillot", featuredMedia: null },
        inventoryItem: {
          id: "item-1",
          tracked: true,
          updatedAt: "2026-10-14T12:00:00Z",
          inventoryLevels: {
            pageInfo: { hasNextPage: false },
            nodes: [
              {
                location: { id: "loc-1", name: "Nom renommé" },
                quantities: [{ name: "available", quantity: 7 }],
              },
            ],
          },
        },
      },
      locations,
    );
    expect(mapped.stock).toEqual({ casa: 7, tanger: 0, stockCasa: 0 });
    expect(mapped.locationIds.casa).toBe("loc-1");
  });

  it("marks inventory with incomplete nested pagination as uncertain", () => {
    const mapped = mapShopifyVariant(
      {
        id: "variant-1",
        title: "Default Title",
        selectedOptions: [],
        product: { id: "product-1", title: "Ballon", featuredMedia: null },
        inventoryItem: {
          id: "item-1",
          tracked: true,
          inventoryLevels: { pageInfo: { hasNextPage: true }, nodes: [] },
        },
      },
      locations,
    );
    expect(mapped.locationsComplete).toBe(false);
  });

  it("sends a guarded idempotent negative adjustment", async () => {
    process.env.SHOPIFY_SHOP = "footmb-test.myshopify.com";
    process.env.SHOPIFY_CLIENT_ID = "client";
    process.env.SHOPIFY_CLIENT_SECRET = "secret";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { inventoryAdjustQuantities: { userErrors: [], inventoryAdjustmentGroup: { createdAt: "2026-10-17T12:00:00Z", changes: [{ name: "available", delta: -2, quantityAfterChange: 5 }] } } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await adjustInventoryQuantities("11111111-1111-4111-8111-111111111111", [{ inventoryItemId: "item-1", locationId: "loc-1", quantity: 2, currentQuantity: 7 }]);
    expect(result.quantitiesAfter).toEqual([5]);
    const request = fetchMock.mock.calls[1][1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload.query).toContain("@idempotent(key: $idempotencyKey)");
    expect(payload.variables.input.changes[0]).toMatchObject({ delta: -2, changeFromQuantity: 7, inventoryItemId: "item-1", locationId: "loc-1" });
  });

  it("uses the supported inventoryItems arguments for incremental sync", async () => {
    process.env.SHOPIFY_SHOP = "footmb-test.myshopify.com";
    process.env.SHOPIFY_CLIENT_ID = "client";
    process.env.SHOPIFY_CLIENT_SECRET = "secret";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          inventoryItems: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchUpdatedInventoryItemPage(
      null,
      locations,
      "2026-10-17T12:00:00.000Z",
      "2026-10-17T12:05:00.000Z",
    );

    const request = fetchMock.mock.calls[1][1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload.query).toContain("inventoryItems(first: 100, after: $cursor, query: $query)");
    expect(payload.query).not.toContain("sortKey");
    expect(payload.variables.query).toBe(
      "updated_at:>='2026-10-17T12:00:00.000Z' updated_at:<='2026-10-17T12:05:00.000Z'",
    );
  });
});
