import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { parseWebhook, verifyWebhookSignature } from "./webhook";

describe("Shopify webhook verification", () => {
  beforeEach(() => {
    process.env.SHOPIFY_SHOP = "footmb-test.myshopify.com";
  });

  it("accepts the exact raw body signed with HMAC-SHA256", () => {
    const raw = Buffer.from('{"inventory_item_id":123,"available":7}');
    const signature = createHmac("sha256", "secret").update(raw).digest("base64");
    expect(verifyWebhookSignature(raw, signature, "secret")).toBe(true);
    expect(verifyWebhookSignature(Buffer.from("changed"), signature, "secret")).toBe(false);
  });

  it("rejects malformed or wrong-length signatures without throwing", () => {
    expect(verifyWebhookSignature(Buffer.from("{}"), "not-base64", "secret")).toBe(false);
    expect(verifyWebhookSignature(Buffer.from("{}"), "", "secret")).toBe(false);
  });

  it("validates the shop, topic, delivery id, and required resource id", () => {
    const headers = new Headers({
      "x-shopify-webhook-id": "delivery-1",
      "x-shopify-topic": "inventory_levels/update",
      "x-shopify-shop-domain": "footmb-test.myshopify.com",
      "x-shopify-triggered-at": "2026-10-14T12:00:00Z",
    });
    const event = parseWebhook(Buffer.from('{"inventory_item_id":123}'), headers);
    expect(event.id).toBe("delivery-1");
    expect(event.topic).toBe("inventory_levels/update");
    expect(() =>
      parseWebhook(
        Buffer.from('{"inventory_item_id":123}'),
        new Headers({ ...Object.fromEntries(headers), "x-shopify-shop-domain": "attacker.myshopify.com" }),
      ),
    ).toThrow(/shop/i);
    expect(() =>
      parseWebhook(Buffer.from("{}"), headers),
    ).toThrow(/inventory_item_id/);
  });
});
