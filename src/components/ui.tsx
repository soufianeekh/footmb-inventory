"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { LOCATIONS, fmt, isKnown, isOut, isLow, type Product, type StockItem } from "@/lib/inventory";
import { useInventory } from "@/components/inventory-provider";

export function PageHeading({ eyebrow, title, description, action }: {
  eyebrow: string; title: string; description: string; action?: React.ReactNode;
}) {
  return <div className="mb-6 flex min-w-0 items-start justify-between gap-4 sm:mb-8">
    <div className="min-w-0">
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.17em] text-[#49e6ac] sm:text-xs">{eyebrow}</p>
      <h1 className="text-[29px] font-extrabold leading-tight tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-[12px] leading-relaxed text-[#97a3ae] sm:text-sm">{description}</p>
    </div>
    {action}
  </div>;
}

export function Surface({ children, className = "" }: {
  children: React.ReactNode; className?: string;
}) {
  return <section className={`min-w-0 overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#12171d] ${className}`}>{children}</section>;
}

export function Metric({ title, value, icon, emphasis = false, hint }: {
  title: string; value: number | string; icon?: IconName; emphasis?: boolean; hint?: string;
}) {
  return <div className={`min-w-0 rounded-[19px] border p-4 sm:p-5 ${
    emphasis ? "border-[#49e6ac]/20 bg-gradient-to-br from-[#18302b] to-[#151b20]" :
    "border-white/[0.08] bg-[#14191f]"
  }`}>
    <div className="flex items-center justify-between gap-2">
      <p className="truncate text-xs font-medium text-[#a1abb5]">{title}</p>
      {icon && <Icon name={icon} size={17} className={emphasis ? "text-[#49e6ac]" : "text-[#657484]"}/>}
    </div>
    <p className="mt-3 text-[29px] font-extrabold leading-none tabular-nums tracking-tight sm:text-[34px]">{typeof value === "number" ? fmt(value) : value}</p>
    {hint && <p className={`mt-2 text-[10px] ${emphasis ? "text-[#49e6ac]" : "text-[#74818e]"}`}>{hint}</p>}
  </div>;
}

export function LoadingPanel({ rows = 4 }: { rows?: number }) {
  return <div role="status" aria-label="Chargement" className="space-y-3">
    {Array.from({ length: rows }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-[18px] border border-white/[0.05] bg-white/[0.045]"/>)}
  </div>;
}

export function EmptyPanel({ title = "Aucun résultat", detail }: {
  title?: string; detail?: string;
}) {
  return <div className="flex min-h-44 flex-col items-center justify-center px-5 py-10 text-center">
    <Icon name="search" size={25} className="mb-3 text-[#71808c]"/>
    <p className="text-sm font-semibold">{title}</p>
    {detail && <p className="mt-2 max-w-sm text-xs leading-5 text-[#8795a2]">{detail}</p>}
  </div>;
}

export function ProductImage({ src, alt, size = "md" }: { src: string | null; alt: string; size?: "md" | "lg" }) {
  return <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#e1e6ea]/20 bg-[#fff] ${
    size === "lg" ? "size-24 sm:size-28" : "size-[76px] sm:size-[86px]"
  }`}>
    {src ? (
      // Images come from Shopify's product CDN.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} loading="lazy" className="size-full object-contain"/>
    ) : <Icon name="package" size={28} className="text-[#9ca3af]"/>}
  </div>;
}

export function StatusTag({ product }: { product: Product }) {
  if (!isKnown(product)) return <span className="inline-flex rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300">Stock partiel / non suivi</span>;
  if (isOut(product)) return <span className="inline-flex rounded-md bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-300">Rupture</span>;
  if (isLow(product)) return <span className="inline-flex rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300">Stock faible</span>;
  return <span className="inline-flex rounded-md bg-[#49e6ac]/10 px-2 py-1 text-[10px] font-semibold text-[#49e6ac]">En stock</span>;
}

export function StockBadges({ items, limit }: { items: StockItem[]; limit?: number }) {
  if (!items.length) return <span className="text-[11px] text-[#687684]">Indisponible</span>;
  const shown = limit ? items.slice(0, limit) : items;
  return <div className="flex min-w-0 flex-wrap gap-1.5">
    {shown.map((item) => <span key={item.size}
      className="inline-flex min-h-[29px] items-center whitespace-nowrap rounded-lg border border-[#36e0aa]/15 bg-[#36e0aa]/10 px-2 text-[11px] font-semibold tabular-nums text-[#52e8b2]">
      {item.size} <span className="ml-1 text-[#d6e9e4]">×{fmt(item.quantity)}</span>
    </span>)}
    {limit && items.length > limit && <span className="inline-flex items-center rounded-lg border border-white/10 px-2 text-[11px] text-[#a1acb6]">+{items.length - limit}</span>}
  </div>;
}

export function ProductCard({ product }: { product: Product }) {
  return <article className="min-w-0 overflow-hidden rounded-[20px] border border-white/[0.09] bg-[#151a20]">
    <div className="flex min-w-0 items-start gap-3 p-3.5 sm:p-4">
      <Link href={`/inventory/${product.slug}`} aria-label={`Détails de ${product.model}`}><ProductImage src={product.image} alt={product.model}/></Link>
      <div className="min-w-0 flex-1">
        <Link href={`/inventory/${product.slug}`} className="line-clamp-2 text-[13px] font-extrabold leading-[19px] hover:text-[#49e6ac] sm:text-[15px]">{product.model}</Link>
        <div className="mt-2"><StatusTag product={product}/></div>
      </div>
      <Link href={`/inventory/${product.slug}`} className="flex min-w-[56px] shrink-0 flex-col items-center justify-center rounded-xl bg-white/[0.055] px-2.5 py-2.5" aria-label={`Voir ${product.model}`}>
        <span className="text-[21px] font-extrabold leading-none tabular-nums">{fmt(product.total)}</span>
        <span className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-[#8995a0]">unités</span>
      </Link>
    </div>
    <div className="mx-3.5 border-t border-white/[0.06]">
      {LOCATIONS.map((loc) => <div key={loc.key} className="grid grid-cols-[75px_minmax(0,1fr)] gap-2 border-b border-white/[0.055] py-3 last:border-b-0 sm:grid-cols-[105px_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-[#d6dde4]">{loc.short}</p>
          <p className="mt-1 text-[10px] text-[#7d8a96]">{fmt(product.units[loc.key])} unités</p>
        </div>
        <StockBadges items={product.sizes[loc.key]} limit={5}/>
      </div>)}
    </div>
    <Link href={`/inventory/${product.slug}`}
      className="flex min-h-11 items-center justify-between border-t border-white/[0.06] px-4 text-[11px] font-semibold text-[#b2bec8] hover:bg-white/[0.025]">
      Voir toutes les tailles et détails <Icon name="chevron-right" size={17}/>
    </Link>
  </article>;
}

export function DataDisclaimer() {
  const { stats, ready } = useInventory();
  if (!ready || !stats.uncertain) return null;
  return <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.055] px-3 py-3 text-xs leading-5 text-amber-200">
    <Icon name="alert" size={17} className="mt-0.5 shrink-0"/>
    {fmt(stats.uncertain)} modèles comportent des variantes non suivies ou des informations incomplètes. Ils ne sont pas comptés comme ruptures certaines.
  </div>;
}

export function QuickLink({ href, icon, title, detail }: {
  href: string; icon: IconName; title: string; detail: string;
}) {
  return <Link href={href} className="flex min-h-[79px] items-center gap-3 rounded-[17px] border border-white/[0.08] bg-[#161c22] p-4 transition hover:border-[#49e6ac]/25 hover:bg-[#1c2529]">
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-[#49e6ac]"><Icon name={icon} size={20}/></span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-bold">{title}</span>
      <span className="mt-1 block text-[11px] leading-4 text-[#84919d]">{detail}</span>
    </span>
    <Icon name="chevron-right" size={17} className="shrink-0 text-[#87939e]"/>
  </Link>;
}
