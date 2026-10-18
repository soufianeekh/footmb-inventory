import { NextResponse } from "next/server";
import { permissionSession } from "@/lib/admin-auth";
import { listSales } from "@/lib/sales";
import { fetchShopifySaleSummaries } from "@/lib/sync/shopify";

const SOURCES = ["delivery", "store", "site", "shopify_pos"] as const;
type Source = typeof SOURCES[number];

export async function GET(request: Request) {
  if (!(await permissionSession("statistics.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get("days") || 30);
  const days = [7, 30, 60].includes(requestedDays) ? requestedDays : 30;
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60_000);
  const since = sinceDate.toISOString();
  const [manual, shopify] = await Promise.all([listSales(5000), fetchShopifySaleSummaries(since)]);
  const totals = Object.fromEntries(SOURCES.map((source) => [source, { sales: 0, units: 0 }])) as Record<Source, { sales: number; units: number }>;
  const daily = new Map<string, Record<Source, number>>();
  const add = (source: Source, createdAt: string, units: number) => {
    totals[source].sales += 1;
    totals[source].units += units;
    const day = createdAt.slice(0, 10);
    const row = daily.get(day) || { delivery: 0, store: 0, site: 0, shopify_pos: 0 };
    row[source] += units;
    daily.set(day, row);
  };
  for (const sale of manual) {
    if (sale.createdAt >= since) add(sale.source, sale.createdAt, sale.lines.reduce((sum, line) => sum + line.quantity, 0));
  }
  for (const sale of shopify) add(sale.source, sale.createdAt, sale.units);
  const dailyRows = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 24 * 60 * 60_000).toISOString().slice(0, 10);
    dailyRows.push({ date, ...(daily.get(date) || { delivery: 0, store: 0, site: 0, shopify_pos: 0 }) });
  }
  return NextResponse.json({
    days,
    totals,
    daily: dailyRows,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
