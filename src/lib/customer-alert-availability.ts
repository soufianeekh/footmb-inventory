import "server-only";

import { ensureManagementContext } from "@/lib/management-context";
import { getSnapshot } from "@/lib/sync/store";

/** Promote matching requests when a Shopify inventory webhook confirms new stock. */
export async function promoteAvailableCustomerAlerts() {
  const snapshot = await getSnapshot();
  if (!snapshot) return 0;
  const { sql, shopId } = await ensureManagementContext();
  const waiting = await sql<{
    id: string; shopify_product_gid: string; shopify_variant_gid: string | null;
    shopify_location_gid: string; requested_quantity: number; requested_size: string | null;
  }[]>`
    select id, shopify_product_gid, shopify_variant_gid, shopify_location_gid,
      requested_quantity, requested_size
    from customer_stock_alerts
    where shop_id = ${shopId} and status = 'waiting'
      and (expires_at is null or expires_at > now())
    order by created_at asc limit 500`;
  const ready = waiting.flatMap((alert) => {
    const location = snapshot.meta.locations.find((item) => item.id === alert.shopify_location_gid)?.key;
    if (!location) return [];
    const variant = snapshot.variants.find((item) => item.productId === alert.shopify_product_gid && item.variantId === alert.shopify_variant_gid);
    if (!variant || (variant.stock[location as keyof typeof variant.stock] || 0) < alert.requested_quantity) return [];
    return [{ ...alert, location }];
  });
  if (!ready.length) return 0;

  return sql.begin(async (tx) => {
    let promoted = 0;
    for (const alert of ready) {
      const [updated] = await tx<{ id: string }[]>`
        update customer_stock_alerts set status = 'available', available_at = now(), updated_at = now()
        where shop_id = ${shopId} and id = ${alert.id} and status = 'waiting'
        returning id`;
      if (!updated) continue;
      promoted += 1;
      await tx`insert into audit_logs (shop_id, actor_user_id, action, resource_type, resource_id, outcome, after_state)
        values (${shopId}, null, 'customer_alert.stock_available', 'customer_stock_alert', ${alert.id}, 'completed',
          ${tx.json({ productId: alert.shopify_product_gid, variantId: alert.shopify_variant_gid, locationId: alert.shopify_location_gid, size: alert.requested_size, quantity: alert.requested_quantity })})`;
      const dedupeKey = `customer-alert:available:${alert.id}`;
      const [notice] = await tx<{ id: string }[]>`
        insert into notifications (shop_id, kind, title, body, resource_type, resource_id, dedupe_key, severity)
        values (${shopId}, 'customer_alert.available', 'Stock disponible pour un client',
          ${`Une demande de taille ${alert.requested_size || "—"} est disponible dans ${alert.location}.`},
          'customer_stock_alert', ${alert.id}, ${dedupeKey}, 'success')
        on conflict (shop_id, dedupe_key) do nothing returning id`;
      if (notice) await tx`insert into notification_recipients (notification_id, user_id)
        select ${notice.id}, id from app_users where shop_id = ${shopId} and active = true and role in ('builder', 'admin')
        on conflict (notification_id, user_id) do nothing`;
    }
    return promoted;
  });
}
