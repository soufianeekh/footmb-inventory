"use client";

import Link from "next/link";
import { useInventory } from "@/components/inventory-provider";
import { PageHeading, Metric, Surface, QuickLink, LoadingPanel, DataDisclaimer } from "@/components/ui";
import { Icon } from "@/components/icons";
import { LOCATIONS, fmt, formatSync, isLow } from "@/lib/inventory";

export default function OverviewPage() {
  const { products, stats, ready, syncedAt } = useInventory();
  const lowProducts = products.filter(isLow).sort((a, b) => a.total - b.total).slice(0, 5);
  const maxLocation = Math.max(1, ...LOCATIONS.map((loc) => stats.units[loc.key]));

  return <div>
    <PageHeading eyebrow="FOOTMB / Dashboard" title="Vue d'ensemble"
      description={`Votre stock Shopify, organisé au même endroit. · Mise à jour : ${formatSync(syncedAt)}`}/>
    {!ready ? <LoadingPanel rows={4}/> : <>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <div className="col-span-2"><Metric title="Unités disponibles" value={stats.total} icon="box" emphasis hint="Sur 3 emplacements Shopify"/></div>
        <Metric title="Modèles" value={stats.models} icon="layers" hint="Produits distincts"/>
        <Metric title="Ruptures" value={stats.out} icon="alert" hint="Stock suivi à zéro"/>
        <Metric title="Stock faible" value={stats.low} icon="filter" hint="Entre 1 et 3 unités"/>
        <Metric title="Données à vérifier" value={stats.uncertain} icon="info" hint="Non suivies / partielles"/>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <Surface className="p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-bold">Stock par boutique</h2>
            <Link href="/stats" className="inline-flex items-center gap-1 text-xs font-semibold text-[#49e6ac]">Statistiques <Icon name="chevron-right" size={16}/></Link>
          </div>
          <div className="space-y-6">
            {LOCATIONS.map((location) => <div key={location.key}>
              <div className="mb-2 flex items-center justify-between text-sm"><span className="font-semibold">{location.label}</span><span className="font-bold tabular-nums">{fmt(stats.units[location.key])}</span></div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div className="h-full rounded-full bg-[#49e6ac]" style={{ width: `${(stats.units[location.key] / maxLocation) * 100}%` }}/>
              </div>
            </div>)}
          </div>
        </Surface>
        <Surface className="p-4 sm:p-6">
          <h2 className="mb-4 text-base font-bold">Accès rapide</h2>
          <div className="space-y-2.5">
            <QuickLink href="/inventory" icon="box" title="Voir les produits" detail="Recherche, tailles, magasins"/>
            <QuickLink href="/stats" icon="chart" title="Statistiques" detail="Répartition et alertes de stock"/>
            <QuickLink href="/settings" icon="settings" title="Réglages" detail="Source des données et sécurité"/>
          </div>
        </Surface>
      </div>

      <Surface className="mt-4 p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">À surveiller</h2>
            <p className="mt-1 text-xs text-[#83919e]">Modèles ayant 1 à 3 unités disponibles</p>
          </div>
          <Link href="/inventory?filter=low" className="whitespace-nowrap text-xs font-bold text-[#49e6ac]">Tout voir →</Link>
        </div>
        {lowProducts.length ? <div className="divide-y divide-white/[0.07]">
          {lowProducts.map((p) => <Link key={p.id} href={`/inventory/${p.slug}`}
            className="flex min-h-14 items-center justify-between gap-3 py-3 transition hover:text-[#49e6ac]">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.model}</span>
            <span className="shrink-0 rounded-lg bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-300">{p.total} unités</span>
            <Icon name="chevron-right" size={17}/>
          </Link>)}
        </div> : <p className="py-5 text-sm text-[#85929f]">Aucun modèle en stock faible dans les données suivies.</p>}
      </Surface>
      <DataDisclaimer/>
    </>}
  </div>;
}
