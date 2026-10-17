import { after, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin-auth";
import { runIncrementalSync } from "@/lib/sync/incremental";
import { getSyncStatus } from "@/lib/sync/store";

export async function POST() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  after(async () => {
    await runIncrementalSync({ reason: "manual-incremental" });
  });
  return NextResponse.json(
    { accepted: true, sync: await getSyncStatus() },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
