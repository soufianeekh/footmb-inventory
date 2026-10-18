import { NextResponse } from "next/server";
import { acceptInvitation } from "@/lib/users";
import { recordActivity } from "@/lib/activity";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: unknown; password?: unknown };
    const result = await acceptInvitation(String(body.token || ""), String(body.password || ""));
    await recordActivity({ actorUserId: result.userId, action: "staff.invitation.accepted", resourceType: "user", resourceId: result.userId, outcome: "completed" });
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invitation invalide" }, { status: 400 });
  }
}
