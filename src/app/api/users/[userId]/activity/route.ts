import { NextResponse } from "next/server";
import { permissionSession } from "@/lib/admin-auth";
import { listUserActivity } from "@/lib/activity";

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  if (!(await permissionSession("staff.activity.read"))) return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
  const { userId } = await context.params;
  return NextResponse.json({ activity: await listUserActivity(userId) }, { headers: { "Cache-Control": "private, no-store" } });
}
