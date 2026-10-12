import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

type Location = { name: string };
type InventoryLevel = { location: Location; quantities: { name: string; quantity: number }[] };
type Variant = {
  id: string; title: string;
  selectedOptions: { name: string; value: string }[];
  product: { id: string; title: string; featuredMedia: { preview: { image: { url: string } | null } | null } | null };
  inventoryItem: { tracked: boolean; inventoryLevels: { nodes: InventoryLevel[]; pageInfo: { hasNextPage: boolean } } };
};
let tokenCache: { token: string; expiresAt: number } | null = null;
async function getAccessToken() {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const shop = process.env.SHOPIFY_SHOP!;
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.SHOPIFY_CLIENT_ID!, client_secret: process.env.SHOPIFY_CLIENT_SECRET! }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Shopify auth failed: ${response.status}`);
  const data = await response.json();
  if (!data.access_token) throw new Error("No access token returned");
  const lifetime = Number(data.expires_in) || 3600;
  tokenCache = { token: data.access_token, expiresAt: Date.now() + Math.max(0, lifetime - 60) * 1000 };
  return tokenCache.token;
}
const QUERY = `query InventoryPage($cursor: String) {
  productVariants(first: 20, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title selectedOptions { name value }
      product { id title featuredMedia { preview { image { url } } } }
      inventoryItem { tracked inventoryLevels(first: 10) { pageInfo { hasNextPage } nodes { location { name } quantities(names: ["available"]) { name quantity } } } }
    }
  }
}`;
export async function GET(request: NextRequest) {
  const session = await auth();
  const allowed = process.env.FOOTMB_ADMIN_EMAIL?.trim().toLowerCase();
  if (!allowed || session?.user?.email?.toLowerCase() !== allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const shop = process.env.SHOPIFY_SHOP;
  if (!shop || !process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET) {
    return NextResponse.json({ error: "Missing Shopify configuration" }, { status: 500 });
  }
  try {
    const token = await getAccessToken();
    const cursor = request.nextUrl.searchParams.get("cursor");
    if (cursor && cursor.length > 1024) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    const response = await fetch(`https://${shop}/admin/api/2026-10/graphql.json`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: QUERY, variables: { cursor: cursor || null } }), cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: "Shopify temporarily unavailable" }, { status: response.status === 429 ? 429 : 502 });
    const json = await response.json();
    if (json.errors?.length) {
      const throttled = json.errors.some((e: {extensions?: {code?: string}}) => e.extensions?.code === "THROTTLED");
      return NextResponse.json({ error: throttled ? "Shopify rate limit" : "Shopify GraphQL error" }, { status: throttled ? 429 : 502 });
    }
    const connection = json.data?.productVariants;
    if (!connection) throw new Error("Missing variants data");
    const variants = (connection.nodes as Variant[]).map(variant => {
      const size = variant.selectedOptions.find(option => /^(size|taille|pointure)$/i.test(option.name))?.value ?? variant.title;
      const stock = { casa: 0, tanger: 0, stockCasa: 0 };
      for (const level of variant.inventoryItem.inventoryLevels.nodes) {
        const qty = level.quantities.find(item => item.name === "available")?.quantity ?? 0;
        if (level.location.name === "FOOTMB Casablanca") stock.casa = qty;
        if (level.location.name === "FOOTMB Tanger") stock.tanger = qty;
        if (level.location.name === "Stock Casa") stock.stockCasa = qty;
      }
      return { variantId: variant.id, productId: variant.product.id, model: variant.product.title,
        image: variant.product.featuredMedia?.preview?.image?.url ?? null, size,
        tracked: variant.inventoryItem.tracked,
        locationsComplete: !variant.inventoryItem.inventoryLevels.pageInfo.hasNextPage, stock,
      };
    });
    return NextResponse.json({ success: true, count: variants.length, variants,
      pageInfo: { hasNextPage: connection.pageInfo.hasNextPage, endCursor: connection.pageInfo.endCursor } },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Inventory request failed", error instanceof Error ? error.message : "Unexpected error");
    return NextResponse.json({ error: "Inventory request failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
