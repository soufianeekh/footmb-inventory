"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useInventory } from "@/components/inventory-provider";
import { Icon } from "@/components/icons";
import {
  PageHeading,
  Metric,
  Surface,
  LoadingPanel,
  DataDisclaimer,
  ProductImage,
  StatusTag,
  StockBadges,
} from "@/components/ui";
import {
  AvailabilityChart,
  LocationChart,
  SizeChart,
  SalesSourceChart,
} from "@/components/stock-charts";
import {
  LOCATIONS,
  LOCATION_KEYS,
  fmt,
  isKnown,
  isLow,
  isOut,
} from "@/lib/inventory";

function SectionTitle({
  icon,
  title,
  detail,
}: {
  icon: "box" | "chart" | "alert" | "store";
  title: string;
  detail: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#efedf9] text-primary">
        <Icon name={icon} size={18} />
      </span>
      <div>
        <h2 className="text-sm font-semibold sm:text-base">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export default function StatsPage() {
  const { products, stats, ready } = useInventory();
  const locationMax = Math.max(
    1,
    ...LOCATIONS.map((loc) => stats.units[loc.key]),
  );
  const sizeRanking = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const p of products)
      for (const loc of LOCATION_KEYS)
        for (const item of p.sizes[loc])
          sizes.set(item.size, (sizes.get(item.size) || 0) + item.quantity);
    return [...sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [products]);
  const topModels = useMemo(
    () =>
      [...products]
        .filter(isKnown)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
    [products],
  );
  const atRisk = useMemo(
    () =>
      [...products]
        .filter((p) => isLow(p) || isOut(p))
        .sort((a, b) => a.total - b.total)
        .slice(0, 6),
    [products],
  );
  const healthy = products.filter(
    (p) => isKnown(p) && !isLow(p) && !isOut(p),
  ).length;
  const [salesDays, setSalesDays] = useState(30);
  const [salesStats, setSalesStats] = useState<null | {
    totals: Record<"delivery" | "store" | "site" | "shopify_pos", { sales: number; units: number }>;
    daily: Array<{ date: string; delivery: number; store: number; site: number; shopify_pos: number }>;
  }>(null);
  const [salesError, setSalesError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/sales/stats?days=${salesDays}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Statistiques indisponibles");
        if (active) setSalesStats(body);
      })
      .catch((error) => active && setSalesError(error instanceof Error ? error.message : "Statistiques indisponibles"));
    return () => { active = false; };
  }, [salesDays]);
  return (
    <div>
      <PageHeading
        title="Statistiques"
        description="Comprenez où votre stock est concentré, quelles tailles dominent et quels modèles demandent votre attention."
      />
      {!ready ? (
        <LoadingPanel rows={6} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              title="Unités disponibles"
              value={stats.total}
              icon="box"
              emphasis
              hint="Somme des 3 emplacements"
            />
            <Metric
              title="Modèles suivis"
              value={stats.models}
              icon="layers"
              hint={`${healthy} avec un stock sain`}
            />
            <Metric
              title="Stock faible"
              value={stats.low}
              icon="filter"
              hint="1 à 3 unités disponibles"
            />
            <Metric
              title="Ruptures"
              value={stats.out}
              icon="alert"
              hint="Modèles suivis à zéro"
            />
          </div>
          <Surface className="mt-4 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <SectionTitle icon="chart" title="Sorties et commandes par source" detail="Les commandes Site et Shopify POS viennent de Shopify. Livraison et Magasin comptent les sorties FOOTMB POS, sans preuve de paiement." />
              <select value={salesDays} onChange={(event) => { setSalesError(null); setSalesStats(null); setSalesDays(Number(event.target.value)); }} className="h-9 rounded-md border bg-white px-3 text-xs">
                <option value={7}>7 derniers jours</option><option value={30}>30 derniers jours</option><option value={60}>60 derniers jours</option>
              </select>
            </div>
            {salesError ? <p className="text-sm text-rose-600">{salesError}</p> : !salesStats ? <p className="text-sm text-muted-foreground">Chargement des ventes…</p> : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {([
                  ["delivery", "Sorties · Livraison", "#ff9d0a"],
                  ["site", "Commandes · Site", "#201a70"],
                  ["shopify_pos", "Commandes · Shopify POS", "#7258ff"],
                  ["store", "Sorties · Magasin", "#16a66a"],
                ] as const).map(([key, label, color]) => (
                  <div key={key} className="rounded-xl border p-4">
                    <div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: color }} /><p className="text-xs font-semibold">{label}</p></div>
                    <p className="mt-3 text-2xl font-black tabular-nums">{fmt(salesStats.totals[key].sales)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{fmt(salesStats.totals[key].units)} unités</p>
                  </div>
                ))}
              </div>
            )}
            {salesStats?.daily.length ? <SalesSourceChart data={salesStats.daily} /> : null}
          </Surface>
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
            <Surface className="p-4 sm:p-5">
              <SectionTitle
                icon="chart"
                title="Unités par emplacement"
                detail="La concentration du stock disponible par boutique."
              />
              <LocationChart units={stats.units} />
              <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
                {LOCATIONS.map((loc) => (
                  <div key={loc.key}>
                    <p className="text-[10px] text-muted-foreground">
                      {loc.short}
                    </p>
                    <p className="mt-1 text-sm font-bold tabular-nums">
                      {fmt(stats.units[loc.key])}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#edf0f7]">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${(stats.units[loc.key] / locationMax) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Surface>
            <Surface className="p-4 sm:p-5">
              <SectionTitle
                icon="box"
                title="Santé du stock"
                detail="Répartition des modèles selon leur disponibilité."
              />
              <AvailabilityChart
                available={healthy}
                low={stats.low}
                out={stats.out}
                uncertain={stats.uncertain}
              />
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                {[
                  ["En stock", healthy, "#201a70"],
                  ["Stock faible", stats.low, "#ff9d0a"],
                  ["Rupture", stats.out, "#ff5269"],
                  ["Partiel", stats.uncertain, "#cbd2e8"],
                ].map(([label, value, color]) => (
                  <span
                    key={String(label)}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: String(color) }}
                      />
                      {label}
                    </span>
                    <strong>{value}</strong>
                  </span>
                ))}
              </div>
            </Surface>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Surface className="p-4 sm:p-5">
              <SectionTitle
                icon="chart"
                title="Tailles et variantes dominantes"
                detail="Les tailles qui représentent le plus d’unités disponibles."
              />
              <SizeChart products={products} />
              {sizeRanking.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-4">
                  {sizeRanking.slice(0, 4).map(([size, qty]) => (
                    <div key={size} className="rounded-lg bg-muted/60 p-2.5">
                      <p className="text-xs font-semibold">{size}</p>
                      <p className="mt-1 text-sm font-bold tabular-nums">
                        {fmt(qty)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Surface>
            <Surface className="p-4 sm:p-5">
              <SectionTitle
                icon="store"
                title="Modèles les plus disponibles"
                detail="Les produits qui ont le plus d’unités réparties dans les boutiques."
              />
              <div className="divide-y">
                {topModels.map((p, i) => (
                  <Link
                    key={p.id}
                    href={`/inventory/${p.slug}`}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="w-5 text-center text-xs font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <ProductImage src={p.image} alt={p.model} />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {p.model}
                    </span>
                    <span className="text-sm font-bold tabular-nums">
                      {fmt(p.total)}
                    </span>
                    <Icon
                      name="chevron-right"
                      size={15}
                      className="text-muted-foreground"
                    />
                  </Link>
                ))}
              </div>
            </Surface>
          </div>
          <Surface className="mt-4 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <SectionTitle
                icon="alert"
                title="Produits à risque"
                detail="Ruptures et modèles proches de la rupture."
              />
              <Link
                href="/inventory?filter=low"
                className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary"
              >
                Inventaire <Icon name="chevron-right" size={15} />
              </Link>
            </div>
            {atRisk.length ? (
              <div className="divide-y">
                {atRisk.map((p) => (
                  <Link
                    key={p.id}
                    href={`/inventory/${p.slug}`}
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0"
                  >
                    <ProductImage src={p.image} alt={p.model} />
                    <span className="min-w-0 flex-1 text-xs font-medium sm:text-sm">
                      {p.model}
                      <span className="mt-1 block">
                        <StatusTag product={p} />
                      </span>
                    </span>
                    <div className="flex flex-wrap justify-end gap-1">
                      <StockBadges items={p.sizes.casa} limit={2} />
                    </div>
                    <strong className="w-10 text-right text-sm tabular-nums">
                      {fmt(p.total)}
                    </strong>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucun modèle à risque.
              </p>
            )}
          </Surface>
          <DataDisclaimer />
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Le stock provient de Shopify. Les ventes Site et Shopify POS viennent
            des commandes Shopify; Livraison et Magasin viennent de FOOTMB POS.
          </p>
        </>
      )}
    </div>
  );
}
