"use client";
import Link from "next/link";
import Image from "next/image";
import { Icon, type IconName } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LOCATIONS,
  fmt,
  isKnown,
  isOut,
  isLow,
  type Product,
  type StockItem,
} from "@/lib/inventory";
import { useInventory } from "@/components/inventory-provider";
export function PageHeading({
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-.04em] sm:text-[32px]">
          {title}
        </h1>
        <p className="mt-1.5 max-w-4xl text-[13px] leading-5 text-muted-foreground sm:text-sm">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
export function Surface({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={`min-w-0 gap-0 rounded-[10px] border py-0 shadow-[0_2px_6px_#22225503] ${className}`}
    >
      {children}
    </Card>
  );
}
export function Metric({
  title,
  value,
  icon = "box",
  emphasis = false,
  hint,
}: {
  title: string;
  value: number | string;
  icon?: IconName;
  emphasis?: boolean;
  hint?: string;
}) {
  return (
    <Surface className="p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${emphasis ? "bg-primary text-white" : icon === "alert" ? "bg-rose-100 text-rose-500" : "bg-orange-50 text-[#ff9500]"}`}
        >
          <Icon name={icon} size={24} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] sm:text-[13px]">{title}</p>
          <p className="mt-1 text-[25px] font-bold leading-none tracking-tight tabular-nums">
            {typeof value === "number" ? fmt(value) : value}
          </p>
        </div>
      </div>
      <p className="mt-4 text-[10px] leading-4 text-muted-foreground sm:text-[11px]">
        {hint || "Quantités disponibles sur Shopify"}
      </p>
    </Surface>
  );
}
export function LoadingPanel({ rows = 4 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Chargement des données"
      className="space-y-3"
    >
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  );
}
export function EmptyPanel({
  title = "Aucun résultat",
  detail,
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-5 py-8 text-center">
      <span className="mb-3 rounded-full bg-muted p-3">
        <Icon name="package" size={24} />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      {detail && (
        <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
          {detail}
        </p>
      )}
    </div>
  );
}
export function ProductImage({
  src,
  alt,
  size = "md",
}: {
  src: string | null;
  alt: string;
  size?: "md" | "lg";
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ${size === "lg" ? "size-24 sm:size-28" : "size-12"}`}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={112}
          height={112}
          unoptimized
          className="size-full object-contain"
        />
      ) : (
        <Icon name="package" size={24} className="text-slate-300" />
      )}
    </div>
  );
}
export function StatusTag({ product }: { product: Product }) {
  const [label, cls] = !isKnown(product)
    ? ["Stock partiel", "bg-slate-100 text-slate-600"]
    : isOut(product)
      ? ["Rupture", "bg-rose-50 text-rose-600"]
      : isLow(product)
        ? ["Stock faible", "bg-orange-50 text-orange-600"]
        : ["En stock", "bg-emerald-50 text-emerald-600"];
  return (
    <Badge
      className={`gap-1.5 whitespace-nowrap rounded-full border-0 px-2.5 py-1 text-[11px] font-medium ${cls}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}
export function StockBadges({
  items,
  limit,
}: {
  items: StockItem[];
  limit?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {(limit ? items.slice(0, limit) : items).map((s) => (
        <Badge
          key={s.size}
          variant="secondary"
          className="rounded-md border border-[#e4e7f0] bg-white px-2 py-1 text-[10px] font-semibold text-[#1f245f] shadow-none"
        >
          <span className="mr-1 font-extrabold text-[#ff9500]">
            {fmt(s.quantity)}
          </span>
          <span className="uppercase tracking-[.04em] text-[#747c98]">of</span>
          <span className="ml-1">{s.size}</span>
        </Badge>
      ))}
      {!items.length && (
        <span className="text-xs text-muted-foreground">
          Aucune unité disponible
        </span>
      )}
      {limit && items.length > limit && (
        <span className="text-xs text-muted-foreground">
          +{items.length - limit}
        </span>
      )}
    </div>
  );
}
export function ProductCard({ product }: { product: Product }) {
  return (
    <Surface className="p-4">
      <Link
        href={`/inventory/${product.slug}`}
        className="flex items-start gap-3"
      >
        <ProductImage src={product.image} alt={product.model} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">{product.model}</p>
          <div className="mt-2">
            <StatusTag product={product} />
          </div>
        </div>
        <span className="text-right text-lg font-bold tabular-nums">
          {fmt(product.total)}
          <span className="block text-[9px] font-normal text-muted-foreground">
            unités
          </span>
        </span>
      </Link>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3">
        {LOCATIONS.map((l) => (
          <div key={l.key}>
            <p className="text-[10px] text-muted-foreground">{l.short}</p>
            <p className="mt-1 text-sm font-semibold">
              {fmt(product.units[l.key])}
            </p>
            <div className="mt-2">
              <StockBadges items={product.sizes[l.key]} limit={3} />
            </div>
          </div>
        ))}
      </div>
      <Link
        className="mt-3 flex min-h-9 items-center justify-between border-t pt-2 text-xs"
        href={`/inventory/${product.slug}`}
      >
        Tailles et détails
        <Icon name="chevron-right" size={15} />
      </Link>
    </Surface>
  );
}
export function DataDisclaimer() {
  const { stats, ready } = useInventory();
  return ready && stats.uncertain ? (
    <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs leading-5 text-orange-800">
      {fmt(stats.uncertain)} modèles ont un stock partiel ou non suivi. Ils sont
      exclus des ruptures certaines.
    </p>
  ) : null;
}
export function QuickLink({
  href,
  icon,
  title,
  detail,
}: {
  href: string;
  icon: IconName;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border p-3 text-sm"
    >
      <Icon name={icon} />
      <span className="flex-1">
        {title}
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <Icon name="chevron-right" />
    </Link>
  );
}
