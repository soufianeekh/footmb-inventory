import { NextResponse } from "next/server";
import { permissionSession } from "@/lib/admin-auth";
import { listUsers, updateUser } from "@/lib/users";
import { recordActivity } from "@/lib/activity";

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await permissionSession("staff.manage");
  if (!session) return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
  try {
    const { userId } = await context.params;
    const before = (await listUsers()).find((user) => user.id === userId);
    const body = (await request.json()) as Record<string, unknown>;
    const role = body.role;
    if (role !== undefined && role !== "admin" && role !== "editor" && role !== "reader") throw new Error("Profil invalide");
    const user = await updateUser({
      id: userId, role,
      active: typeof body.active === "boolean" ? body.active : undefined,
      storeKeys: Array.isArray(body.storeKeys) ? body.storeKeys.filter((value): value is string => typeof value === "string") : undefined,
      updatedBy: session.user.id,
    });
    await recordActivity({
      actorUserId: session.user.id, action: "staff.account.updated", resourceType: "user",
      resourceId: user.id, outcome: "completed",
      beforeState: before ? { role: before.role, active: before.active, storeKeys: before.storeKeys } : null,
      afterState: { role: user.role, active: user.active, storeKeys: user.storeKeys },
    });
    return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Modification impossible" }, { status: 400 });
  }
}
