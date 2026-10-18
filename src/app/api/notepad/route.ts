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
  if (!(await permissionSession("notes.read"))) return fail("Accès interdit", 403);
  const { sql, shopId } = await ensureManagementContext();
  const rows = await sql<{
    id: string; title: string; body: string; pinned: boolean; version: number; created_at: Date;
    updated_at: Date; created_by_name: string | null; updated_by_name: string | null;
  }[]>`
    select n.id, n.title, n.body, n.pinned, n.version, n.created_at, n.updated_at,
      c.display_name as created_by_name, u.display_name as updated_by_name
    from notes n left join app_users c on c.id = n.created_by left join app_users u on u.id = n.updated_by
    where n.shop_id = ${shopId} and n.archived_at is null
    order by n.pinned desc, n.updated_at desc limit 200`;
  return NextResponse.json({ notes: rows.map((row) => ({
    id: row.id, title: row.title, body: row.body, pinned: row.pinned, version: row.version,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    createdBy: row.created_by_name, updatedBy: row.updated_by_name,
  })) }, { headers: noStore });
}

export async function POST(request: Request) {
  const session = await permissionSession("notes.write");
  if (!session) return fail("Accès interdit", 403);
  if (!sameOrigin(request)) return fail("Requête non autorisée", 403);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return fail("Requête invalide"); }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 5000) : "";
  if (!title && !text) return fail("Écrivez un titre ou une note.");
  const { sql, shopId } = await ensureManagementContext();
  const note = await sql.begin(async (tx) => {
    const [created] = await tx<{ id: string; title: string; body: string; pinned: boolean; version: number; updated_at: Date }[]>`
      insert into notes (shop_id, title, body, pinned, version, created_by, updated_by)
      values (${shopId}, ${title}, ${text}, ${body.pinned === true}, 1, ${session.user.id}, ${session.user.id})
      returning id, title, body, pinned, version, updated_at`;
    await tx`insert into note_revisions (note_id, version, title, body, edited_by) values (${created.id}, 1, ${created.title}, ${created.body}, ${session.user.id})`;
    await tx`insert into audit_logs (shop_id, actor_user_id, action, resource_type, resource_id, outcome, after_state)
      values (${shopId}, ${session.user.id}, 'notepad.created', 'note', ${created.id}, 'completed', ${tx.json({ version: 1 })})`;
    return created;
  });
  return NextResponse.json({ note: { id: note.id, title: note.title, body: note.body, pinned: note.pinned, version: note.version, updatedAt: note.updated_at.toISOString() } }, { status: 201, headers: noStore });
}

export async function PATCH(request: Request) {
  const session = await permissionSession("notes.write");
  if (!session) return fail("Accès interdit", 403);
  if (!sameOrigin(request)) return fail("Requête non autorisée", 403);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return fail("Requête invalide"); }
  const id = typeof body.id === "string" ? body.id : "";
  const expectedVersion = Number(body.version);
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 5000) : "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(expectedVersion) || expectedVersion < 1) return fail("Version de note invalide");
  if (body.archive === true) {
    const { sql, shopId } = await ensureManagementContext();
    const archived = await sql.begin(async (tx) => {
      const rows = await tx`update notes set archived_at = now(), updated_at = now(), updated_by = ${session.user.id}
        where shop_id = ${shopId} and id = ${id} and archived_at is null returning id`;
      if (!rows.length) return false;
      await tx`insert into audit_logs (shop_id, actor_user_id, action, resource_type, resource_id, outcome)
        values (${shopId}, ${session.user.id}, 'notepad.archived', 'note', ${id}, 'completed')`;
      return true;
    });
    if (!archived) return fail("Note introuvable", 404);
    return NextResponse.json({ archived: true }, { headers: noStore });
  }
  if (!title && !text) return fail("Écrivez un titre ou une note.");
  const { sql, shopId } = await ensureManagementContext();
  const result = await sql.begin(async (tx) => {
    const [old] = await tx<{ version: number; title: string; body: string }[]>`
      select version, title, body from notes where shop_id = ${shopId} and id = ${id} and archived_at is null for update`;
    if (!old) return { error: "Note introuvable", status: 404 };
    if (old.version !== expectedVersion) return { error: "Cette note a été modifiée par un autre membre. Rechargez-la pour voir la dernière version.", status: 409 };
    const [note] = await tx<{ id: string; title: string; body: string; pinned: boolean; version: number; updated_at: Date }[]>`
      update notes set title = ${title}, body = ${text}, pinned = ${body.pinned === true},
        version = version + 1, updated_by = ${session.user.id}, updated_at = now()
      where shop_id = ${shopId} and id = ${id} returning id, title, body, pinned, version, updated_at`;
    await tx`insert into note_revisions (note_id, version, title, body, edited_by)
      values (${note.id}, ${note.version}, ${note.title}, ${note.body}, ${session.user.id})`;
    await tx`insert into audit_logs (shop_id, actor_user_id, action, resource_type, resource_id, outcome, before_state, after_state)
      values (${shopId}, ${session.user.id}, 'notepad.updated', 'note', ${id}, 'completed',
        ${tx.json({ version: old.version })}, ${tx.json({ version: note.version })})`;
    return { note };
  });
  if ("error" in result && typeof result.error === "string") return fail(result.error, "status" in result && typeof result.status === "number" ? result.status : 400);
  return NextResponse.json(result, { headers: noStore });
}
