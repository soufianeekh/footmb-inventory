import { NextResponse } from "next/server";
import { permissionSession } from "@/lib/admin-auth";
import { ensureManagementContext } from "@/lib/management-context";
import { encryptCustomerContact, customerContactLookupHash, maskCustomerContact } from "@/lib/customer-alerts";
import { getSnapshot } from "@/lib/sync/store";
import { LOCATION_KEYS, type LocationKey } from "@/lib/inventory";

const NO_STORE = { "Cache-Control": "private, no-store" };
const CHANNELS = ["phone", "whatsapp", "email"] as const;
const STATUSES = ["waiting", "available", "notified", "resolved", "cancelled", "expired"] as const;

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && fetchSite !== "cross-site";
}

function allowedAtLocation(session: NonNullable<Awaited<ReturnType<typeof permissionSession>>>, location: LocationKey) {
  return session.user.role === "builder" || session.user.storeKeys.includes(location);
}

export async function GET(request: Request) {
  const session = await permissionSession("alerts.read");
  if (!session) return error("Accès interdit", 403);
  const { sql, shopId } = await ensureManagementContext();
  const status = new URL(request.url).searchParams.get("status");
  const rows = await sql<{
    id: string; shopify_product_gid: string; shopify_variant_gid: string | null; shopify_location_gid: string;
    location_key: LocationKey; requested_size: string | null; requested_quantity: number; channel: string;
    contact_hint: string | null; status: string; created_at: Date; available_at: Date | null;
    notified_at: Date | null; resolved_at: Date | null; created_by_name: string | null;
  }[]>`
    select a.id, a.shopify_product_gid, a.shopify_variant_gid, a.shopify_location_gid,
      l.location_key, a.requested_size, a.requested_quantity, a.channel, a.contact_hint,
      a.status, a.created_at, a.available_at, a.notified_at, a.resolved_at,
      u.display_name as created_by_name
    from customer_stock_alerts a
    join shop_locations l on l.shop_id = a.shop_id and l.shopify_location_gid = a.shopify_location_gid
    left join app_users u on u.id = a.created_by
    where a.shop_id = ${shopId}
      and (${status === "active"} = false or a.status in ('waiting', 'available'))
      and (${session.user.role === "builder"} or l.location_key = any(${sql.array(session.user.storeKeys)}::text[]))
    order by a.created_at desc limit 200
  `;
  return NextResponse.json({ alerts: rows.map((row) => ({
    id: row.id,
    productId: row.shopify_product_gid,
    variantId: row.shopify_variant_gid,
    locationId: row.shopify_location_gid,
    location: row.location_key,
    size: row.requested_size,
    quantity: row.requested_quantity,
    channel: row.channel,
    contactHint: row.contact_hint,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    availableAt: row.available_at?.toISOString() ?? null,
    notifiedAt: row.notified_at?.toISOString() ?? null,
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    createdBy: row.created_by_name,
  })) }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const session = await permissionSession("alerts.manage");
  if (!session) return error("Accès interdit", 403);
  if (!sameOrigin(request)) return error("Requête non autorisée", 403);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return error("Requête invalide"); }

  const productId = typeof body.productId === "string" ? body.productId.slice(0, 200) : "";
  const variantId = typeof body.variantId === "string" ? body.variantId.slice(0, 200) : "";
  const location = body.location as LocationKey;
  const channel = body.channel as (typeof CHANNELS)[number];
  const contact = typeof body.contact === "string" ? body.contact.trim() : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  const quantity = Number(body.quantity ?? 1);
  if (!productId || !variantId || !LOCATION_KEYS.includes(location) || !CHANNELS.includes(channel) ||
      contact.length < 5 || contact.length > 180 || !/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(contact) && channel === "email" ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > 20 || body.consent !== true ||
      !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    return error("Vérifiez le produit, le contact, le consentement et la quantité.");
  }
  if (!allowedAtLocation(session, location)) return error("Cet emplacement ne vous est pas attribué", 403);

  const snapshot = await getSnapshot();
  const variant = snapshot?.variants.find((item) => item.variantId === variantId && item.productId === productId);
  if (!variant) return error("Variante Shopify introuvable ou inventaire indisponible", 409);
  const locationId = variant.locationIds?.[location];
  if (!locationId) return error("Emplacement Shopify introuvable pour cette variante", 409);
  if (channel !== "email" && contact.replace(/\D/g, "").length < 8) return error("Coordonnées invalides");

  try {
    const { sql, shopId } = await ensureManagementContext();
    const contactCiphertext = encryptCustomerContact(contact);
    const contactHint = maskCustomerContact(contact);
    const result = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${`${shopId}:${idempotencyKey}`}))`;
      const [prior] = await tx<{ resource_id: string }[]>`
        select resource_id from audit_logs
        where shop_id = ${shopId} and idempotency_key = ${idempotencyKey} and action = 'customer_alert.created'
        limit 1`;
      if (prior?.resource_id) {
        const [existing] = await tx<{ id: string; status: string; created_at: Date; contact_hint: string | null }[]>`
          select id, status, created_at, contact_hint from customer_stock_alerts
          where shop_id = ${shopId} and id = ${prior.resource_id}
        `;
        if (existing) return existing;
      }
      const [alert] = await tx<{
        id: string; status: string; created_at: Date; contact_hint: string | null;
      }[]>`
        insert into customer_stock_alerts (
          shop_id, created_by, shopify_product_gid, shopify_variant_gid, shopify_location_gid,
          requested_size, requested_quantity, channel, contact_ciphertext, contact_lookup_hash,
          contact_hint, consent_recorded_at, status, expires_at
        ) values (
          ${shopId}, ${session.user.id}, ${productId}, ${variantId}, ${locationId},
          ${variant.size}, ${quantity}, ${channel}, ${contactCiphertext}, ${customerContactLookupHash(contact)},
          ${contactHint}, now(), 'waiting', now() + interval '90 days'
        )
        returning id, status, created_at, contact_hint
      `;
      await tx`insert into audit_logs (shop_id, actor_user_id, action, resource_type, resource_id, idempotency_key, outcome, after_state)
        values (${shopId}, ${session.user.id}, 'customer_alert.created', 'customer_stock_alert', ${alert.id},
          ${idempotencyKey}, 'completed', ${tx.json({ productId, variantId, locationId, size: variant.size, quantity, channel, contactHint })})`;
      return alert;
    });
    return NextResponse.json({ alert: { id: result.id, status: result.status, createdAt: result.created_at.toISOString(), contactHint: result.contact_hint } }, { status: 201, headers: NO_STORE });
  } catch (cause) {
    return error(cause instanceof Error && cause.message.includes("AUTH_SECRET") ? "La protection des coordonnées client n'est pas configurée." : "Impossible d'enregistrer la demande client.", 503);
  }
}

export async function PATCH(request: Request) {
  const session = await permissionSession("alerts.manage");
  if (!session) return error("Accès interdit", 403);
  if (!sameOrigin(request)) return error("Requête non autorisée", 403);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return error("Requête invalide"); }
  const id = typeof body.id === "string" ? body.id : "";
  const status = body.status as (typeof STATUSES)[number];
  if (!/^[0-9a-f-]{36}$/i.test(id) || !STATUSES.includes(status)) return error("Statut invalide");
  const { sql, shopId } = await ensureManagementContext();
  // Read the cached Shopify snapshot before opening a database transaction. Redis
  // access inside the transaction would hold a connection and row lock unnecessarily.
  const [candidate] = await sql<{ status: string; location_key: LocationKey; shopify_product_gid: string; shopify_variant_gid: string | null; requested_quantity: number }[]>`
    select a.status, l.location_key, a.shopify_product_gid, a.shopify_variant_gid, a.requested_quantity
    from customer_stock_alerts a
    join shop_locations l on l.shop_id = a.shop_id and l.shopify_location_gid = a.shopify_location_gid
    where a.shop_id = ${shopId} and a.id = ${id}`;
  if (!candidate) return error("Demande introuvable", 404);
  if (!allowedAtLocation(session, candidate.location_key)) return error("Cet emplacement ne vous est pas attribué", 403);
  if (status === "available") {
    const snapshot = await getSnapshot();
    const variant = snapshot?.variants.find((item) => item.variantId === candidate.shopify_variant_gid && item.productId === candidate.shopify_product_gid);
    if (!variant || variant.stock[candidate.location_key] < candidate.requested_quantity) {
      return error("Le stock demandé n’est pas encore disponible dans cette boutique.", 409);
    }
  }
  const result = await sql.begin(async (tx) => {
    const [old] = await tx<{ status: string; location_key: LocationKey; shopify_product_gid: string; shopify_variant_gid: string | null; requested_quantity: number }[]>`
      select a.status, l.location_key, a.shopify_product_gid, a.shopify_variant_gid, a.requested_quantity from customer_stock_alerts a
      join shop_locations l on l.shop_id = a.shop_id and l.shopify_location_gid = a.shopify_location_gid
      where a.shop_id = ${shopId} and a.id = ${id} for update`;
    if (!old) return { error: "Demande introuvable", statusCode: 404 };
    if (!allowedAtLocation(session, old.location_key)) return { error: "Cet emplacement ne vous est pas attribué", statusCode: 403 };
    const transitions: Record<string, string[]> = {
      waiting: ["available", "resolved", "cancelled", "expired"],
      available: ["notified", "resolved", "cancelled", "expired"],
      notified: ["resolved", "cancelled"],
      resolved: [], cancelled: [], expired: [],
    };
    if (!transitions[old.status]?.includes(status)) return { error: "Transition de statut impossible", statusCode: 409 };
    const [updated] = await tx<{ id: string; status: string }[]>`
      update customer_stock_alerts set status = ${status},
        available_at = case when ${status} = 'available' then now() else available_at end,
        notified_at = case when ${status} = 'notified' then now() else notified_at end,
        resolved_at = case when ${status} in ('resolved', 'cancelled', 'expired') then now() else resolved_at end,
        updated_at = now()
      where shop_id = ${shopId} and id = ${id} returning id, status`;
    await tx`insert into audit_logs (shop_id, actor_user_id, action, resource_type, resource_id, outcome, before_state, after_state)
      values (${shopId}, ${session.user.id}, 'customer_alert.status_changed', 'customer_stock_alert', ${id},
        'completed', ${tx.json({ status: old.status })}, ${tx.json({ status })})`;
    return { alert: updated };
  });
  if ("error" in result && typeof result.error === "string") return error(result.error, "statusCode" in result && typeof result.statusCode === "number" ? result.statusCode : 400);
  return NextResponse.json(result, { headers: NO_STORE });
}
