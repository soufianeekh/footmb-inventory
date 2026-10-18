import { NextResponse } from "next/server";
import { permissionSession } from "@/lib/admin-auth";
import { ensureManagementContext } from "@/lib/management-context";

const noStore = { "Cache-Control": "private, no-store" };
function fail(message: string, status = 400) { return NextResponse.json({ error: message }, { status, headers: noStore }); }
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return (!origin || origin === new URL(request.url).origin) && request.headers.get("sec-fetch-site") !== "cross-site";
}

export async function GET() {
  const session = await permissionSession("notifications.read");
  if (!session) return fail("Accès interdit", 403);
  const { sql, shopId } = await ensureManagementContext();
  const rows = await sql<{
    id: string; kind: string; title: string; body: string; resource_type: string | null;
    resource_id: string | null; severity: string; created_at: Date; read_at: Date | null; dismissed_at: Date | null;
  }[]>`
    select n.id, n.kind, n.title, n.body, n.resource_type, n.resource_id, n.severity,
      n.created_at, r.read_at, r.dismissed_at
    from notification_recipients r join notifications n on n.id = r.notification_id
    where n.shop_id = ${shopId} and r.user_id = ${session.user.id} and r.dismissed_at is null
    order by n.created_at desc limit 100`;
  return NextResponse.json({ notifications: rows.map((row) => ({
    id: row.id, kind: row.kind, title: row.title, body: row.body, resourceType: row.resource_type,
    resourceId: row.resource_id, severity: row.severity, createdAt: row.created_at.toISOString(),
    readAt: row.read_at?.toISOString() ?? null, dismissedAt: row.dismissed_at?.toISOString() ?? null,
  })) }, { headers: noStore });
}

export async function PATCH(request: Request) {
  const session = await permissionSession("notifications.manage");
  if (!session) return fail("Accès interdit", 403);
  if (!sameOrigin(request)) return fail("Requête non autorisée", 403);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return fail("Requête invalide"); }
  const id = typeof body.id === "string" ? body.id : "";
  const action = body.action;
  if (!/^[0-9a-f-]{36}$/i.test(id) || (action !== "read" && action !== "dismiss")) return fail("Notification invalide");
  const { sql, shopId } = await ensureManagementContext();
  const result = action === "read"
    ? await sql`update notification_recipients r set read_at = coalesce(read_at, now())
        from notifications n where r.notification_id = n.id and n.shop_id = ${shopId}
          and r.notification_id = ${id} and r.user_id = ${session.user.id} returning r.notification_id`
    : await sql`update notification_recipients r set dismissed_at = now(), read_at = coalesce(read_at, now())
        from notifications n where r.notification_id = n.id and n.shop_id = ${shopId}
          and r.notification_id = ${id} and r.user_id = ${session.user.id} returning r.notification_id`;
  if (!result.length) return fail("Notification introuvable", 404);
  return NextResponse.json({ updated: true }, { headers: noStore });
}
