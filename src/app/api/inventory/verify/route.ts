import { NextResponse } from "next/server";
import { isEditorSession } from "@/lib/admin-auth";
import { normalizeGid } from "@/lib/sync/config";
import { fetchProductVariants } from "@/lib/sync/shopify";
import { getSnapshot, replaceProductVariants } from "@/lib/sync/store";

export async function POST(request: Request) {
  if (!(await isEditorSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { productId?: unknown };
  try {
    body = (await request.json()) as { productId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const productId = normalizeGid("Product", body.productId);
  if (!productId) {
    return NextResponse.json({ error: "A valid productId is required" }, { status: 400 });
  }
  const snapshot = await getSnapshot();
  if (!snapshot) {
    return NextResponse.json({ error: "Inventory snapshot is not ready" }, { status: 409 });
  }
  try {
    const authoritative =
      (await fetchProductVariants(productId, snapshot.meta.locations)) || [];
    const cached = snapshot.variants.filter((variant) => variant.productId === productId);
    const before = JSON.stringify(
      cached.map(({ variantId, stock, tracked }) => ({ variantId, stock, tracked })),
    );
    const after = JSON.stringify(
      authoritative.map(({ variantId, stock, tracked }) => ({ variantId, stock, tracked })),
    );
    const repaired = before !== after;
    const verifiedAt = new Date().toISOString();
    const revision = await replaceProductVariants(
      snapshot.meta.snapshotId,
      productId,
      authoritative,
      verifiedAt,
    );
    return NextResponse.json({
      success: true,
      repaired,
      revision,
      verifiedAt,
      cachedVariants: cached.length,
      authoritativeVariants: authoritative.length,
    });
  } catch (error) {
    console.error("Product verification failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Shopify verification failed" }, { status: 502 });
  }
}
