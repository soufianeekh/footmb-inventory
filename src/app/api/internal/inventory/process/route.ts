import { NextResponse } from "next/server";
import { hasInternalAccess } from "@/lib/sync/internal-auth";
import { runReconciliationSlice } from "@/lib/sync/reconcile";
import { processInventoryQueue } from "@/lib/sync/worker";

export async function POST(request: Request) {
  if (!hasInternalAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const queue = await processInventoryQueue(40);
  const reconciliation = await runReconciliationSlice({
    reason: "internal",
    budgetMs: 6_000,
    skipWhenReady: true,
  });
  return NextResponse.json({ queue, reconciliation });
}
