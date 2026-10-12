"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useInventory } from "@/components/inventory-provider";
import {
  PageHeading, Surface, ProductCard, StockBadges, ProductImage, StatusTag,
  EmptyPanel, LoadingPanel, DataDisclaimer,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  LOCATIONS, fmt, isOut, isLow,
  type LocationFilter, type SortKey, type Product, type LocationKey,
} from "@/lib/inventory";

const PAGE_SIZE = 18;
const filters: { key: LocationFilter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "casa", label: "Casablanca" },
  { key: "tanger", label: "Tanger" },
  { key: "stockCasa", label: "Stock Casa" },
  { key: "low", label: "Stock faible" },
  { key: "out", label: "Rupture" },
];

function ProductTable({ products }: { products: Product[] }) {
  return <div className="hidden xl:block">
    <table className="w-full text-left">
      <thead className="border-b border-white/[0.08] bg-white/[0.025]">
        <tr className="text-[10px] font-bold uppercase tracking-wider text-[#81909e]">
          <th className="w-[30%] px-4 py-4">Produit</th>
          {LOCATIONS.map((loc) => <th key={loc.key} className="px-3 py-4">{loc.label}</th>)}
          <th className="px-4 py-4 text-right">Total</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/[0.055]">
        {products.map((product) => <tr key={product.id} className="hover:bg-white/[0.025]">
          <td className="px-4 py-3">
            <Link href={`/inventory/${product.slug}`} className="flex min-w-[235px] items-center gap-3">
              <ProductImage src={product.image} alt={product.model}/>
              <span className="min-w-0"><span className="block text-sm font-bold leading-5">{product.model}</span><span className="mt-1 block"><StatusTag product={product}/></span></span>
            </Link>
          </td>
          {LOCATIONS.map((loc) => <td key={loc.key} className="px-3 py-3 align-middle"><StockBadges items={product.sizes[loc.key]}/></td>)}
          <td className="px-4 py-3 text-right text-base font-black tabular-nums">{fmt(product.total)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function InventoryView() {
  const { products, ready, syncing } = useInventory();
  const query = useSearchParams();
  const requested = query.get("filter");
  const initialFilter: LocationFilter = filters.some((v) => v.key === requested)
    ? requested as LocationFilter : "all";
  const [filter, setFilter] = useState<LocationFilter>(initialFilter);
  const [search, setSearch] = useState("");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [page, setPage] = useState(1);

  const availableSizes = useMemo(() => {
    const sizes = new Set<string>();
    products.forEach((p) => LOCATIONS.forEach((loc) =>
      p.sizes[loc.key].forEach((item) => sizes.add(item.size))));
    return Array.from(sizes).sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  }, [products]);

  const matching = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("fr");
    const selectedLocation: LocationKey[] =
      filter === "casa" || filter === "tanger" || filter === "stockCasa" ?
      [filter] : ["casa", "tanger", "stockCasa"];
    const rows = products.filter((p) => {
      if (term && !p.model.toLocaleLowerCase("fr").includes(term)) return false;
      if (filter === "out" && !isOut(p)) return false;
      if (filter === "low" && !isLow(p)) return false;
      if (filter === "casa" || filter === "tanger" || filter === "stockCasa") {
        if (p.units[filter] <= 0) return false;
      }
      if (sizeFilter !== "all" &&
        !selectedLocation.some((key) => p.sizes[key].some((s) => s.size === sizeFilter && s.quantity > 0))) return false;
      return true;
    });
    if (sort === "most") rows.sort((a, b) => b.total - a.total || a.model.localeCompare(b.model));
    if (sort === "least") rows.sort((a, b) => a.total - b.total || a.model.localeCompare(b.model));
    return rows;
  }, [products, search, filter, sizeFilter, sort]);

  const maxPage = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const activePage = Math.min(page, maxPage);
  const pageProducts = matching.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const resetFilters = () => { setFilter("all"); setSearch(""); setSizeFilter("all"); setSort("name"); setPage(1); };

  return <div className="min-w-0">
    <PageHeading eyebrow="FOOTMB / Inventaire" title="Inventaire"
      description="Chaque modèle, ses tailles et ses quantités par boutique."/>
    <Surface>
      <div className="space-y-4 border-b border-white/[0.08] p-3.5 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold sm:text-base">Stock des produits</h2>
            <p className="mt-1 text-[11px] text-[#83929d]" aria-live="polite">
              {ready ? `${fmt(matching.length)} modèles sur ${fmt(products.length)}` : "Chargement des produits…"}
              {syncing && ready ? " · Actualisation…" : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 py-2 text-[10px] text-[#8d9ba7]">Lecture seule</span>
        </div>
        <label className="relative block">
          <span className="sr-only">Rechercher un modèle</span>
          <Icon name="search" size={19} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a99a7]"/>
          <input type="search" placeholder="Rechercher un modèle (ex: Phantom)…"
            value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            className="h-12 w-full min-w-0 rounded-xl border border-white/10 bg-[#20262d] pl-11 pr-3 text-sm outline-none placeholder:text-[#798693] focus:border-[#49e6ac]/60"/>
        </label>
        {/* Six wrapped cells prevent the horizontal scrollbar shown in the old mobile version. */}
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap" aria-label="Filtrer les produits">
          {filters.map((item) => <button key={item.key} type="button"
            aria-pressed={filter === item.key}
            onClick={() => { setFilter(item.key); setPage(1); if (item.key === "out") setSizeFilter("all"); }}
            className={`min-h-11 min-w-0 rounded-xl border px-1.5 text-[11px] font-bold transition active:scale-[.98] sm:px-4 sm:text-xs ${
              filter === item.key ? "border-white bg-white text-[#11161c]" :
              "border-white/[0.07] bg-[#242a32] text-[#b6c0ca] hover:border-white/20"
            }`}>
            {item.label}
          </button>)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0">
            <span className="mb-1.5 block text-[11px] text-[#96a3af]">Taille / variante</span>
            <select aria-label="Filtrer par taille" value={sizeFilter} disabled={filter === "out"}
              onChange={(e) => { setSizeFilter(e.target.value); setPage(1); }}
              className="h-11 w-full min-w-0 rounded-xl border border-white/10 bg-[#222830] px-2.5 text-xs font-semibold outline-none disabled:opacity-40">
              <option value="all">Toutes les tailles</option>
              {availableSizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-1.5 block text-[11px] text-[#96a3af]">Trier par</span>
            <select aria-label="Trier les produits" value={sort}
              onChange={(e) => { setSort(e.target.value as SortKey); setPage(1); }}
              className="h-11 w-full min-w-0 rounded-xl border border-white/10 bg-[#222830] px-2.5 text-xs font-semibold outline-none">
              <option value="name">Nom A – Z</option><option value="most">Plus de stock</option><option value="least">Moins de stock</option>
            </select>
          </label>
        </div>
      </div>
      {!ready ? <div className="p-4"><LoadingPanel/></div> : <>
        <div className="space-y-3 bg-[#0d1116] p-3 sm:p-4 xl:hidden">
          {pageProducts.map((product) => <ProductCard key={product.id} product={product}/>)}
        </div>
        <ProductTable products={pageProducts}/>
        {!pageProducts.length && <div className="bg-[#12171d]"><EmptyPanel title="Aucun produit trouvé" detail="Essayez un autre nom, une taille différente, ou supprimez vos filtres."/>
          <div className="pb-6 text-center"><button onClick={resetFilters} className="min-h-11 rounded-xl border border-white/10 px-5 text-xs font-bold">Effacer les filtres</button></div></div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-4 sm:px-5">
          <span className="text-xs text-[#8795a2]">{fmt(matching.length)} résultats</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage((v) => Math.max(1, v - 1))}
              disabled={activePage <= 1} aria-label="Page précédente"
              className="flex size-11 items-center justify-center rounded-xl border border-white/10 disabled:opacity-25">
              <Icon name="chevron-left"/>
            </button>
            <span className="min-w-20 text-center text-xs font-semibold tabular-nums">{activePage} / {maxPage}</span>
            <button type="button" onClick={() => setPage((v) => Math.min(maxPage, v + 1))}
              disabled={activePage >= maxPage} aria-label="Page suivante"
              className="flex size-11 items-center justify-center rounded-xl border border-white/10 disabled:opacity-25">
              <Icon name="chevron-right"/>
            </button>
          </div>
        </div>
      </>}
    </Surface>
    <DataDisclaimer/>
  </div>;
}

// Next.js requires a Suspense boundary around useSearchParams on this route.
export default function InventoryPage() {
  return <Suspense fallback={<div className="space-y-3"><LoadingPanel rows={5}/></div>}>
    <InventoryView/>
  </Suspense>;
}
