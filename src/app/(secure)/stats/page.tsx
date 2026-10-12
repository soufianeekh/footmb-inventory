"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useInventory } from "@/components/inventory-provider";
import { Icon } from "@/components/icons";
import { PageHeading, Metric, Surface, LoadingPanel, DataDisclaimer } from "@/components/ui";
import { LOCATIONS, LOCATION_KEYS, fmt, isKnown } from "@/lib/inventory";

export default function StatsPage() {
  const { products, stats, ready } = useInventory();
  const locationMax = Math.max(1, ...LOCATIONS.map((loc) => stats.units[loc.key]));
  const sizeRanking = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const p of products) for (const loc of LOCATION_KEYS) {
      for (const item of p.sizes[loc]) {
        sizes.set(item.size, (sizes.get(item.size) || 0) + item.quantity);
      }
    }
    return [...sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [products]);
  const topModels = useMemo(() =>
    [...products].filter(isKnown).sort((a, b) => b.total - a.total).slice(0, 5),
  [products]);

  return <div>
    <PageHeading eyebrow="FOOTMB / Analyse" title="Statistiques"
      description="Un aperçu de vos disponibilités par boutique, modèle et taille."/>
    {!ready ? <LoadingPanel rows={5}/> : <>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <Metric title="Unités disponibles" value={stats.total} icon="box" emphasis/>
        <Metric title="Modèles" value={stats.models} icon="layers"/>
        <Metric title="Ruptures" value={stats.out} icon="alert" hint="Stock suivi à 0"/>
        <Metric title="Stock faible" value={stats.low} icon="filter" hint="1 à 3 unités"/>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Surface className="p-4 sm:p-6">
          <div className="mb-6">
            <h2 className="text-base font-bold">Répartition des unités</h2>
            <p className="mt-1 text-xs text-[#8a97a2]">Selon l’emplacement Shopify</p>
          </div>
          <div className="space-y-6">
            {LOCATIONS.map((loc) => {
              const value = stats.units[loc.key];
              const percent = stats.total ? (value / stats.total) * 100 : 0;
              return <div key={loc.key}>
                <div className="mb-2 flex justify-between gap-2 text-sm">
                  <span className="font-semibold">{loc.label}</span>
                  <span className="shrink-0 font-bold tabular-nums">{fmt(value)} <span className="ml-1 text-xs font-normal text-[#86939f]">{percent.toFixed(1)}%</span></span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white/[0.07]">
                  <div className="h-full rounded-full bg-[#49e6ac] transition-all" style={{ width: `${(value / locationMax) * 100}%` }}/>
                </div>
              </div>;
            })}
          </div>
        </Surface>
        <Surface className="p-4 sm:p-6">
          <div className="mb-6"><h2 className="text-base font-bold">Tailles / variantes</h2><p className="mt-1 text-xs text-[#8a97a2]">Top 7 selon les quantités disponibles</p></div>
          {sizeRanking.length ? <div className="space-y-3.5">
            {sizeRanking.map(([size, qty]) => <div key={size} className="flex min-w-0 items-center gap-3">
              <span className="w-14 shrink-0 truncate text-xs font-semibold">{size}</span>
              <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div className="h-full rounded-full bg-[#60bfa6]" style={{ width: `${(qty / sizeRanking[0][1]) * 100}%` }}/>
              </div>
              <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums">{fmt(qty)}</span>
            </div>)}
          </div> : <p className="text-xs text-[#8a97a2]">Aucune donnée de taille suivie.</p>}
        </Surface>
      </div>

      <Surface className="mt-4 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="text-base font-bold">Modèles les plus disponibles</h2><p className="mt-1 text-xs text-[#8a97a2]">Classement par quantité totale</p></div>
          <Link href="/inventory" className="flex items-center gap-1 text-xs font-bold text-[#49e6ac]">Inventaire <Icon name="chevron-right" size={16}/></Link>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {topModels.map((p, i) => <Link key={p.id} href={`/inventory/${p.slug}`} className="flex min-h-16 items-center gap-3 py-3 transition hover:text-[#49e6ac]">
            <span className="w-6 shrink-0 text-center text-xs font-bold text-[#7e8b98]">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold sm:text-sm">{p.model}</span>
            <span className="shrink-0 text-sm font-black tabular-nums">{fmt(p.total)}</span>
            <Icon name="chevron-right" size={16} className="shrink-0"/>
          </Link>)}
        </div>
      </Surface>
      <DataDisclaimer/>
      <p className="mt-5 text-xs leading-5 text-[#71808e]">Ces statistiques concernent le stock disponible, pas les ventes. Les quantités non suivies ne sont pas incluses.</p>
    </>}
  </div>;
}
