import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { LOCATION_KEYS, type LocationKey } from "@/lib/inventory";
import { getSale, listSales, putSale, type ManualSaleSource, type SaleEvent, type SaleLine } from "@/lib/sales";
import { adjustInventoryQuantities, fetchInventoryItemVariant } from "@/lib/sync/shopify";
import { applyInventoryItemVariant, getSnapshot } from "@/lib/sync/store";

type RequestLine = { variantId?: unknown; location?: unknown; quantity?: unknown };

function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return badRequest("Unauthorized", 401);
  return NextResponse.json({ sales: await listSales(100) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return badRequest("Unauthorized", 401);
  if (session.user.role !== "editor" && session.user.role !== "admin") {
    return badRequest("Votre profil est en lecture seule", 403);
  }
  let body: { operationId?: unknown; source?: unknown; lines?: unknown };
  try { body = await request.json(); } catch { return badRequest("Requête invalide"); }
  const operationId = typeof body.operationId === "string" ? body.operationId : "";
  if (!/^[0-9a-f-]{36}$/i.test(operationId)) return badRequest("Identifiant d’opération invalide");
  const existing = await getSale(operationId);
  if (existing?.status === "completed") return NextResponse.json({ success: true, sale: existing });
  const source = existing?.source || (body.source as ManualSaleSource);
  if (source !== "delivery" && source !== "store") return badRequest("Source de vente invalide");
  if (!existing && (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 30)) {
    return badRequest("La vente doit contenir entre 1 et 30 lignes");
  }
  const snapshot = await getSnapshot();
  if (!snapshot) return badRequest("Inventaire indisponible", 503);
  const seen = new Set<string>();
  const lines: SaleLine[] = existing ? existing.lines : [];
  for (const raw of (existing ? [] : body.lines) as RequestLine[]) {
    const variantId = typeof raw.variantId === "string" ? raw.variantId : "";
    const location = raw.location as LocationKey;
    const quantity = Number(raw.quantity);
    if (!variantId || !LOCATION_KEYS.includes(location) || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return badRequest("Ligne de vente invalide");
    }
    const unique = `${variantId}:${location}`;
    if (seen.has(unique)) return badRequest("Une variante ne peut apparaître qu’une fois par emplacement");
    seen.add(unique);
    const variant = snapshot.variants.find((item) => item.variantId === variantId);
    if (!variant?.tracked || !variant.locationsComplete) return badRequest("Cette variante ne peut pas être ajustée");
    const locationId = variant.locationIds[location];
    const current = variant.stock[location];
    if (!locationId) return badRequest("Emplacement Shopify introuvable");
    if (current < quantity) return badRequest(`Stock insuffisant pour ${variant.model} (${variant.size})`, 409);
    lines.push({
      variantId,
      inventoryItemId: variant.inventoryItemId,
      productId: variant.productId,
      productName: variant.model,
      size: variant.size,
      location,
      locationId,
      quantity,
      quantityBefore: current,
    });
  }
  const started: SaleEvent = existing || {
    id: operationId,
    status: "pending",
    source,
    lines,
    actor: {
      id: session.user.id,
      name: session.user.name || session.user.email,
      email: session.user.email,
    },
    createdAt: new Date().toISOString(),
    completedAt: null,
    error: null,
  };
  await putSale(started);
  try {
    const result = await adjustInventoryQuantities(
      operationId,
      lines.map((line) => ({
        inventoryItemId: line.inventoryItemId,
        locationId: line.locationId,
        quantity: line.quantity,
        currentQuantity: line.quantityBefore,
      })),
    );
    for (const inventoryItemId of new Set(lines.map((line) => line.inventoryItemId))) {
      const fresh = await fetchInventoryItemVariant(inventoryItemId, snapshot.meta.locations);
      if (fresh) await applyInventoryItemVariant(snapshot.meta.snapshotId, fresh, result.createdAt);
    }
    const completed: SaleEvent = { ...started, status: "completed", completedAt: result.createdAt, error: null };
    await putSale(completed);
    return NextResponse.json({ success: true, sale: completed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = (error instanceof Error ? error.message : "La vente Shopify a échoué").slice(0, 500);
    await putSale({ ...started, status: "failed", error: message });
    return badRequest(message, 409);
  }
}
