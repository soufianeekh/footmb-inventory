import { type NextRequest, NextResponse } from "next/server";
import { isAuthenticatedSession } from "@/lib/admin-auth";
import { getSnapshotMeta, getSyncStatus } from "@/lib/sync/store";

export async function GET(request: NextRequest) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [snapshot, status] = await Promise.all([getSnapshotMeta(), getSyncStatus()]);
  const requestedRevision = Number(request.nextUrl.searchParams.get("since") || 0);
  const currentRevision = snapshot?.revision ?? 0;
  return NextResponse.json(
    {
      revision: currentRevision,
      changed:
        Number.isFinite(requestedRevision) && currentRevision > requestedRevision,
      verifiedAt: snapshot?.verifiedAt ?? null,
      reconciledAt: status.lastReconciledAt ?? snapshot?.reconciledAt ?? null,
      sync: status,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
