import "server-only";

import { ensureManagementContext } from "@/lib/management-context";

export type StockMovementLine = {
  productId: string; variantId: string; inventoryItemId: string; locationId: string;
  productName: string; size: string; quantity: number; quantityBefore: number;
};

export async function beginStockMovement(input: {
  id: string; actorUserId: string; reason: "delivery" | "store"; lines: StockMovementLine[];
}) {
  const { sql, shopId } = await ensureManagementContext();
  await sql.begin(async (tx) => {
    await tx`insert into stock_movements (id, shop_id, actor_user_id, reason, status)
      values (${input.id}, ${shopId}, ${input.actorUserId}, ${input.reason}, 'pending')
      on conflict (id) do nothing`;
    for (const line of input.lines) {
      await tx`insert into stock_movement_lines (
        movement_id, shopify_product_gid, shopify_variant_gid, shopify_inventory_item_gid,
        shopify_location_gid, product_title_snapshot, variant_title_snapshot,
        quantity_delta, quantity_before
      ) values (
        ${input.id}, ${line.productId}, ${line.variantId}, ${line.inventoryItemId}, ${line.locationId},
        ${line.productName}, ${line.size}, ${-line.quantity}, ${line.quantityBefore}
      ) on conflict (movement_id, shopify_inventory_item_gid, shopify_location_gid) do nothing`;
    }
  });
}

export async function completeStockMovement(id: string, completedAt: string) {
  const { sql } = await ensureManagementContext();
  await sql.begin(async (tx) => {
    await tx`update stock_movement_lines set quantity_after = quantity_before + quantity_delta where movement_id = ${id}`;
    await tx`update stock_movements set status = 'completed', shopify_reference_uri = ${`footmb://sale/${id}`},
      shopify_completed_at = ${completedAt}, error_code = null, error_message = null, updated_at = now()
      where id = ${id}`;
  });
}

export async function failStockMovement(id: string, message: string) {
  const { sql } = await ensureManagementContext();
  await sql`update stock_movements set status = 'failed', error_message = ${message}, updated_at = now()
    where id = ${id} and status <> 'completed'`;
}
