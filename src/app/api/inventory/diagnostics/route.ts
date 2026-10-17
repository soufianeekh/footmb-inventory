import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin-auth";
import { SHOPIFY_API_VERSION, configuredShop } from "@/lib/sync/config";
import { buildDiagnostics } from "@/lib/sync/store";
import { SUPPORTED_WEBHOOK_TOPICS } from "@/lib/sync/types";

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let shop: string | null = null;
  try {
    shop = configuredShop();
  } catch {
    // Report an absent shop without exposing credentials.
  }
  return NextResponse.json(
    await buildDiagnostics(shop, SHOPIFY_API_VERSION, [...SUPPORTED_WEBHOOK_TOPICS]),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
