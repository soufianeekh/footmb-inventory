import { NextResponse } from "next/server";
import { permissionSession } from "@/lib/admin-auth";
import { ensureManagementContext } from "@/lib/management-context";
import { decryptCustomerContact } from "@/lib/customer-alerts";
import type { LocationKey } from "@/lib/inventory";

export async function GET(_request: Request, context: { params: Promise<{ alertId: string }> }) {
  const session = await permissionSession("alerts.manage");
  if (!session) return NextResponse.json({ error: "Accès interdit" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const { alertId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(alertId)) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  const { sql, shopId } = await ensureManagementContext();
  const rows = await sql<{ contact_ciphertext: Buffer; location_key: LocationKey }[]>`
    select a.contact_ciphertext, l.location_key from customer_stock_alerts a
    join shop_locations l on l.shop_id = a.shop_id and l.shopify_location_gid = a.shopify_location_gid
    where a.shop_id = ${shopId} and a.id = ${alertId} limit 1`;
  const alert = rows[0];
  if (!alert) return NextResponse.json({ error: "Demande introuvable" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (session.user.role !== "builder" && !session.user.storeKeys.includes(alert.location_key)) {
    return NextResponse.json({ error: "Cet emplacement ne vous est pas attribué" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const [log] = await sql<{ id: string }[]>`
    insert into audit_logs (shop_id, actor_user_id, action, resource_type, resource_id, outcome)
    values (${shopId}, ${session.user.id}, 'customer_alert.contact_viewed', 'customer_stock_alert', ${alertId}, 'completed')
    returning id`;
  let contact: string;
  try { contact = decryptCustomerContact(alert.contact_ciphertext); }
  catch { return NextResponse.json({ error: "Coordonnées client indisponibles" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  return NextResponse.json({ contact, auditId: log.id }, { headers: { "Cache-Control": "private, no-store" } });
}
