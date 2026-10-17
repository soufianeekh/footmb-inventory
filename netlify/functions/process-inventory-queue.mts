import { runReconciliationSlice } from "../../src/lib/sync/reconcile";
import { processInventoryQueue } from "../../src/lib/sync/worker";

export default async function handler() {
  const queue = await processInventoryQueue(40);
  const reconciliation = await runReconciliationSlice({
    reason: "scheduled-resume",
    budgetMs: 6_000,
    skipWhenReady: true,
  });
  return Response.json({ queue, reconciliation });
}

export const config = { schedule: "* * * * *" };
