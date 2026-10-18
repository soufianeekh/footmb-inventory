import "server-only";

import { hasDatabaseConfiguration } from "@/lib/db";
import { ensureManagementContext } from "@/lib/management-context";

export type ActivityOutcome = "accepted" | "completed" | "rejected" | "failed";

export async function recordActivity(input: {
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: ActivityOutcome;
  requestId?: string | null;
  idempotencyKey?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  metadata?: Record<string, unknown>;
}) {
  if (!hasDatabaseConfiguration()) throw new Error("Une connexion à la base de données durable est requise pour le journal d’activité");
  const { sql, shopId } = await ensureManagementContext();
  const [row] = await sql<{ id: string; occurred_at: Date }[]>`
    insert into audit_logs (
      shop_id, actor_user_id, action, resource_type, resource_id, request_id,
      idempotency_key, outcome, before_state, after_state, metadata
    ) values (
      ${shopId}, ${input.actorUserId}, ${input.action}, ${input.resourceType}, ${input.resourceId || null},
      ${input.requestId || null}, ${input.idempotencyKey || null}, ${input.outcome},
      ${input.beforeState === undefined ? null : sql.json(input.beforeState as never)},
      ${input.afterState === undefined ? null : sql.json(input.afterState as never)},
      ${sql.json((input.metadata || {}) as never)}
    )
    on conflict (shop_id, idempotency_key, action) where idempotency_key is not null
    do update set outcome = excluded.outcome, after_state = excluded.after_state,
      metadata = excluded.metadata, occurred_at = now()
    returning id, occurred_at
  `;
  return { id: row.id, occurredAt: row.occurred_at.toISOString() };
}

export async function recordSuccessfulLogin(userId: string) {
  if (!hasDatabaseConfiguration()) return;
  const { sql, shopId } = await ensureManagementContext();
  await sql.begin(async (tx) => {
    await tx`update app_users set last_login_at = now(), updated_at = now() where id = ${userId} and shop_id = ${shopId}`;
    await tx`insert into audit_logs (shop_id, actor_user_id, action, resource_type, resource_id, outcome)
      values (${shopId}, ${userId}, 'auth.login.succeeded', 'user', ${userId}, 'completed')`;
  });
}

export type ActivityItem = {
  id: string; action: string; resourceType: string; resourceId: string | null;
  outcome: ActivityOutcome; beforeState: unknown; afterState: unknown;
  metadata: Record<string, unknown>; occurredAt: string;
};

export async function listUserActivity(userId: string, limit = 100): Promise<ActivityItem[]> {
  if (!hasDatabaseConfiguration()) return [];
  const { sql, shopId } = await ensureManagementContext();
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const rows = await sql<{
    id: string; action: string; resource_type: string; resource_id: string | null;
    outcome: ActivityOutcome; before_state: unknown; after_state: unknown;
    metadata: Record<string, unknown>; occurred_at: Date;
  }[]>`select id, action, resource_type, resource_id, outcome, before_state, after_state, metadata, occurred_at
    from audit_logs where shop_id = ${shopId} and (
      actor_user_id = ${userId} or (resource_type = 'user' and resource_id = ${userId})
    )
    order by occurred_at desc limit ${safeLimit}`;
  return rows.map((row) => ({
    id: row.id, action: row.action, resourceType: row.resource_type, resourceId: row.resource_id,
    outcome: row.outcome, beforeState: row.before_state, afterState: row.after_state,
    metadata: row.metadata, occurredAt: row.occurred_at.toISOString(),
  }));
}
