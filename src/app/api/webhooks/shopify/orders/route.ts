import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureManagementContext } from "@/lib/management-context";
import { normalizeGid, configuredShop } from "@/lib/sync/config";
import { MAX_WEBHOOK_BYTES, verifyWebhookSignature } from "@/lib/sync/webhook";

type OrderPayload = {
  id?: string | number;
  admin_graphql_api_id?: string;
  name?: string;
  source_name?: string;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  cancelled_at?: string | null;
  created_at?: string;
  updated_at?: string;
  total_price?: string;
  currency?: string;
  presentment_currency?: string;
};

function fail(message: string, status: number) { return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_WEBHOOK_BYTES) return fail("Payload too large", 413);
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > MAX_WEBHOOK_BYTES) return fail("Payload too large", 413);
  if (!verifyWebhookSignature(raw, request.headers.get("x-shopify-hmac-sha256") || "", process.env.SHOPIFY_CLIENT_SECRET || "")) return fail("Invalid signature", 401);

  const deliveryId = request.headers.get("x-shopify-webhook-id")?.trim() || "";
  const topic = request.headers.get("x-shopify-topic")?.trim().toLowerCase() || "";
  const domain = request.headers.get("x-shopify-shop-domain")?.trim().toLowerCase() || "";
  if (!deliveryId || deliveryId.length > 200 || !["orders/create", "orders/updated", "orders/cancelled"].includes(topic)) return fail("Invalid order webhook metadata", 400);
  try { if (domain !== configuredShop()) return fail("Webhook shop does not match configuration", 400); }
  catch { return fail("Shopify webhook configuration unavailable", 503); }

  let order: OrderPayload;
  try { order = JSON.parse(Buffer.from(raw).toString("utf8")) as OrderPayload; }
  catch { return fail("Invalid JSON payload", 400); }
  const orderGid = typeof order.admin_graphql_api_id === "string"
    ? order.admin_graphql_api_id : normalizeGid("Order", order.id);
  if (!orderGid || !/^gid:\/\/shopify\/Order\/[0-9]+$/.test(orderGid)) return fail("Order ID is missing", 400);
  const createdAt = validDate(order.created_at) || new Date().toISOString();
  const updatedAt = validDate(order.updated_at) || createdAt;
  const orderName = typeof order.name === "string" && order.name.length <= 80 ? order.name : `#${String(order.id || "")}`;
  const sourceName = typeof order.source_name === "string" ? order.source_name.slice(0, 80) : null;
  const safeStatus = (value: unknown) => typeof value === "string" ? value.slice(0, 40) : null;
  const total = typeof order.total_price === "string" && /^\d{1,12}(\.\d{1,4})?$/.test(order.total_price) ? order.total_price : null;
  const currency = typeof (order.presentment_currency || order.currency) === "string" ? String(order.presentment_currency || order.currency).slice(0, 3) : null;
  const redacted = { orderGid, orderName, sourceName, financialStatus: safeStatus(order.financial_status), fulfillmentStatus: safeStatus(order.fulfillment_status), cancelledAt: validDate(order.cancelled_at), createdAt, updatedAt, total, currency };

  try {
    const { sql, shopId } = await ensureManagementContext();
    const result = await sql.begin(async (tx) => {
      const [event] = await tx<{ id: string }[]>`
        insert into external_events (shop_id, provider, provider_event_id, topic, resource_gid, triggered_at, payload_sha256, payload_redacted, status, processed_at)
        values (${shopId}, 'shopify', ${deliveryId}, ${topic}, ${orderGid}, ${request.headers.get("x-shopify-triggered-at")},
          ${createHash("sha256").update(raw).digest("hex")}, ${tx.json(redacted)}, 'processed', now())
        on conflict (provider, provider_event_id) do nothing returning id`;
      if (!event) return { duplicate: true };

      await tx`insert into shopify_order_refs (
          shop_id, shopify_order_gid, order_name, source_name, financial_status, fulfillment_status,
          cancelled_at, shopify_created_at, shopify_updated_at, refreshed_at
        ) values (
          ${shopId}, ${orderGid}, ${orderName}, ${sourceName}, ${safeStatus(order.financial_status)},
          ${safeStatus(order.fulfillment_status)}, ${validDate(order.cancelled_at)}, ${createdAt}, ${updatedAt}, now()
        ) on conflict (shop_id, shopify_order_gid) do update set
          order_name = excluded.order_name, source_name = excluded.source_name,
          financial_status = excluded.financial_status, fulfillment_status = excluded.fulfillment_status,
          cancelled_at = excluded.cancelled_at, shopify_updated_at = greatest(shopify_order_refs.shopify_updated_at, excluded.shopify_updated_at),
          refreshed_at = now()`;

      if (topic === "orders/create" || topic === "orders/cancelled") {
        const isCancelled = topic === "orders/cancelled";
        const dedupeKey = `shopify:${isCancelled ? "order-cancelled" : "order-created"}:${orderGid}`;
        const [notice] = await tx<{ id: string }[]>`
          insert into notifications (shop_id, kind, title, body, resource_type, resource_id, source_event_id, dedupe_key, severity)
          values (${shopId}, ${isCancelled ? "shopify.order.cancelled" : "shopify.order.created"},
            ${isCancelled ? `Commande annulée · ${orderName}` : `Nouvelle commande · ${orderName}`},
            ${isCancelled ? `La commande ${orderName} a été annulée dans Shopify.` : `Commande en ligne${sourceName ? ` · ${sourceName}` : ""}${total ? ` · ${total} ${currency || ""}` : ""}.`},
            'shopify_order', ${orderGid}, ${event.id}, ${dedupeKey}, ${isCancelled ? "warning" : "info"})
          on conflict (shop_id, dedupe_key) do nothing returning id`;
        if (notice) await tx`insert into notification_recipients (notification_id, user_id)
          select ${notice.id}, id from app_users where shop_id = ${shopId} and active = true and role in ('builder', 'admin')
          on conflict (notification_id, user_id) do nothing`;
      }
      return { duplicate: false };
    });
    return NextResponse.json({ accepted: true, duplicate: result.duplicate }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Order webhook could not be stored", 503);
  }
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
