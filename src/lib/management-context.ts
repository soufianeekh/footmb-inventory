import "server-only";

import { database } from "@/lib/db";
import { configuredShop, DEFAULT_LOCATION_NAMES, LOCATION_ID_ENV } from "@/lib/sync/config";
import { LOCATION_KEYS } from "@/lib/inventory";

export async function ensureManagementContext() {
  const sql = database();
  const domain = configuredShop();
  const [shop] = await sql<{ id: string }[]>`
    insert into shops (myshopify_domain, display_name)
    values (${domain}, 'FOOTMB')
    on conflict (myshopify_domain) do update set updated_at = now()
    returning id
  `;

  for (const key of LOCATION_KEYS) {
    const locationId = LOCATION_ID_ENV[key];
    if (!locationId) continue;
    const gid = locationId.startsWith("gid://") ? locationId : `gid://shopify/Location/${locationId}`;
    await sql`
      insert into shop_locations (shop_id, shopify_location_gid, location_key, display_name)
      values (${shop.id}, ${gid}, ${key}, ${DEFAULT_LOCATION_NAMES[key]})
      on conflict (shop_id, location_key) do update set
        shopify_location_gid = excluded.shopify_location_gid,
        display_name = excluded.display_name,
        active = true,
        updated_at = now()
    `;
  }
  return { sql, shopId: shop.id };
}
