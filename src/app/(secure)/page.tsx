"use client";
import Link from "next/link";
import { useInventory } from "@/components/inventory-provider";
import {
  PageHeading,
  Surface,
  Metric,
  EmptyPanel,
  ProductImage,
  StatusTag,
  DataDisclaimer,
} from "@/components/ui";
import { LocationChart, AvailabilityChart } from "@/components/stock-charts";
import { Icon } from "@/components/icons";
import {
  LOCATIONS,
  fmt,
  formatSync,
  isLow,
  isOut,
  isKnown,
} from "@/lib/inventory";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
function Title({
  icon,
  title,
}: {
  icon: "box" | "chart" | "store" | "alert";
  title: string;
}) {
  return (
    <h2 className="mb-4 flex items-center gap-3 text-[14px] font-semibold">
      <span className="rounded-lg bg-[#efedf9] p-2 text-primary">
        <Icon name={icon} size={18} />
      </span>
      {title}
    </h2>
  );
}
export default function Dashboard() {
  const { products, stats, ready, syncedAt, syncing } = useInventory();
  const attention = products.filter((p) => isLow(p) || isOut(p)).slice(0, 5);
  const metrics = [
    {
      title: "Total d’unités",
      value: stats.total,
      icon: "box" as const,
      emphasis: true,
    },
    { title: "Total produits", value: stats.models, icon: "layers" as const },
    {
      title: "Stock faible",
      value: stats.low,
      icon: "filter" as const,
      hint: "Modèles avec 1 à 3 unités",
    },
    {
      title: "Ruptures",
      value: stats.out,
      icon: "alert" as const,
      hint: "Modèles suivis sans stock",
    },
  ];
  return (
    <>
      <PageHeading
        title="Vue d’ensemble"
        description="Suivez votre inventaire et la disponibilité de vos boutiques en temps réel."
        action={
          <Badge
            variant="outline"
            className="gap-2 bg-white px-3 py-2 font-normal"
          >
            <Icon name="clock" size={15} />
            {syncedAt
              ? `Mis à jour à ${formatSync(syncedAt)}`
              : "Inventaire en temps réel"}
          </Badge>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <Metric key={m.title} {...m} value={ready ? m.value : "—"} />
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_1fr_.85fr]">
        <Surface className="p-4 sm:p-5">
          <Title icon="chart" title="Répartition du stock" />
          {ready && stats.total ? (
            <LocationChart units={stats.units} />
          ) : syncing ? (
            <Skeleton className="h-[225px]" />
          ) : (
            <EmptyPanel
              title="Stock non disponible"
              detail="Le graphique apparaîtra après une synchronisation réussie."
            />
          )}
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            Unités disponibles par emplacement
          </p>
        </Surface>
        <Surface className="p-4 sm:p-5">
          <Title icon="box" title="Disponibilité des produits" />
          {ready && products.length ? (
            <>
              <AvailabilityChart
                available={
                  products.filter((p) => isKnown(p) && !isOut(p) && !isLow(p))
                    .length
                }
                low={stats.low}
                out={stats.out}
                uncertain={stats.uncertain}
              />
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {[
                  ["En stock", "#201a70"],
                  ["Stock faible", "#ff9d0a"],
                  ["Rupture", "#ff5269"],
                  ["Stock partiel", "#cbd2e8"],
                ].map(([label, color]) => (
                  <span key={label} className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: color }}
                    />
                    {label}
                  </span>
                ))}
              </div>
            </>
          ) : syncing ? (
            <Skeleton className="h-[225px]" />
          ) : (
            <EmptyPanel
              title="Aucune donnée disponible"
              detail="Les statuts reposent sur les quantités Shopify suivies."
            />
          )}
        </Surface>
        <Surface className="order-first p-4 sm:p-5 xl:order-none">
          <Title icon="store" title="Stock par boutique" />
          <div className="space-y-6">
            {LOCATIONS.map((l, i) => {
              const percent = stats.total
                ? (stats.units[l.key] / stats.total) * 100
                : 0;
              return (
                <div key={l.key} className="flex gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#f2f4fa] text-muted-foreground">
                    <Icon name="store" size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">{l.label}</p>
                    <div className="mt-1.5 flex justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        {ready ? fmt(stats.units[l.key]) : "—"} unités
                      </span>
                      <span className="font-semibold">
                        {ready ? `${Math.round(percent)}%` : "—"}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e9ecf5]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${percent}%`,
                          background: i ? "#ff9d0a" : "#201a70",
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Surface>
      </div>
      <Surface className="mt-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Title icon="alert" title="Produits à surveiller" />
          <Link
            href="/inventory?filter=low"
            className="mb-4 flex items-center gap-2 text-xs underline underline-offset-2"
          >
            Voir l’inventaire
            <Icon name="chevron-right" size={15} />
          </Link>
        </div>
        {attention.length ? (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/70">
                    <TableHead>Produit</TableHead>
                    {LOCATIONS.map((l) => (
                      <TableHead key={l.key}>{l.label}</TableHead>
                    ))}
                    <TableHead>Total</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attention.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link
                          href={`/inventory/${p.slug}`}
                          className="flex items-center gap-3"
                        >
                          <ProductImage src={p.image} alt={p.model} />
                          <span className="text-xs font-medium">{p.model}</span>
                        </Link>
                      </TableCell>
                      {LOCATIONS.map((l) => (
                        <TableCell key={l.key} className="text-xs tabular-nums">
                          {fmt(p.units[l.key])}
                        </TableCell>
                      ))}
                      <TableCell className="font-semibold">
                        {fmt(p.total)}
                      </TableCell>
                      <TableCell>
                        <StatusTag product={p} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="divide-y md:hidden">
              {attention.map((p) => (
                <Link
                  key={p.id}
                  href={`/inventory/${p.slug}`}
                  className="flex items-center gap-3 py-3"
                >
                  <ProductImage src={p.image} alt={p.model} />
                  <span className="min-w-0 flex-1 text-xs font-medium">
                    {p.model}
                    <span className="mt-2 block">
                      <StatusTag product={p} />
                    </span>
                  </span>
                  <span className="font-bold">{fmt(p.total)}</span>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <EmptyPanel
            title={
              ready ? "Aucun produit en alerte" : "En attente de l’inventaire"
            }
            detail={
              ready
                ? "Aucun modèle suivi en rupture ou avec 1 à 3 unités disponibles."
                : "Connectez Shopify pour consulter les disponibilités et les alertes réelles."
            }
          />
        )}
      </Surface>
      <DataDisclaimer />
    </>
  );
}
