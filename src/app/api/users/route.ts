import { NextResponse } from "next/server";
import { permissionSession } from "@/lib/admin-auth";
import { inviteUser, listUsers } from "@/lib/users";
import { recordActivity } from "@/lib/activity";

function forbidden() {
  return NextResponse.json({ error: "Accès interdit" }, { status: 403, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  if (!(await permissionSession("staff.read"))) return forbidden();
  return NextResponse.json({ users: await listUsers() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const session = await permissionSession("staff.manage");
  if (!session) return forbidden();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.role !== "admin" && body.role !== "editor" && body.role !== "reader") throw new Error("Profil invalide");
    const result = await inviteUser({
      name: String(body.name || ""), email: String(body.email || ""), role: body.role,
      storeKeys: Array.isArray(body.storeKeys) ? body.storeKeys.filter((value): value is string => typeof value === "string") : [],
      active: body.active !== false, createdBy: session.user.id,
    });
    await recordActivity({
      actorUserId: session.user.id, action: "staff.invitation.created", resourceType: "user",
      resourceId: result.user.id, outcome: "completed",
      afterState: { email: result.user.email, role: result.user.role, active: result.user.active, storeKeys: result.user.storeKeys },
    });
    const origin = new URL(request.url).origin;
    return NextResponse.json({ user: result.user, inviteUrl: `${origin}/accept-invite?token=${encodeURIComponent(result.token)}` }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invitation impossible" }, { status: 400 });
  }
}
