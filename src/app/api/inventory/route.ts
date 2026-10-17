import { after } from "next/server";
import { NextResponse } from "next/server";
import { isAuthenticatedSession } from "@/lib/admin-auth";
import { assertProductionSyncConfiguration } from "@/lib/sync/config";
import { runReconciliationSlice } from "@/lib/sync/reconcile";
import { getSnapshot, getSyncStatus } from "@/lib/sync/store";
import { processInventoryQueue } from "@/lib/sync/worker";

export async function GET() {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    assertProductionSyncConfiguration();
    let snapshot = await getSnapshot();
    if (!snapshot) {
      await runReconciliationSlice({
        reason: "initial",
        budgetMs: 4_500,
        skipWhenReady: true,
      });
      snapshot = await getSnapshot();
    }
    if (!snapshot) {
      const status = await getSyncStatus();
      after(async () => {
        await runReconciliationSlice({ reason: "initial", budgetMs: 6_500 });
      });
      return NextResponse.json(
        {
          success: false,
          initializing: true,
          variants: [],
          pageInfo: { hasNextPage: false, endCursor: null },
          sync: status,
          error: status.error || "Initialisation de l’inventaire en cours",
        },
        { status: 202, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    after(async () => {
      await processInventoryQueue(20);
    });
    const status = await getSyncStatus();
    return NextResponse.json(
      {
        success: true,
        count: snapshot.variants.length,
        variants: snapshot.variants,
        revision: snapshot.meta.revision,
        meta: snapshot.meta,
        sync: status,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error(
      "Inventory snapshot request failed",
      error instanceof Error ? error.message : "Unexpected error",
    );
    return NextResponse.json(
      { error: "Inventory snapshot unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
