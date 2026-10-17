import { runIncrementalSync } from "../../src/lib/sync/incremental";

export default async function handler() {
  const reconciliation = await runIncrementalSync({ reason: "scheduled-incremental" });
  return Response.json({ reconciliation });
}

// Webhooks remain the primary path; this catches missed deliveries every 15 minutes.
export const config = { schedule: "*/15 * * * *" };
