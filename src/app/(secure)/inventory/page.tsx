"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useInventory } from "@/components/inventory-provider";
import {
  PageHeading,
  Surface,
  ProductImage,
  ProductCard,
  StatusTag,
  EmptyPanel,
  LoadingPanel,
  DataDisclaimer,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Download,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUpRight,
} from "lucide-react";
import { LOCATIONS, fmt, isLow, isOut, type Product } from "@/lib/inventory";
function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-[10px] text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label={label}
          className="h-11! w-full min-w-0 bg-white text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function InventoryView({
  initialSearch,
  initialStatus,
}: {
  initialSearch: string;
  initialStatus: string;
}) {
  const { products, ready, syncing } = useInventory();
  const [search, setSearch] = useState(initialSearch);
  const [location, setLocation] = useState("all");
  const [size, setSize] = useState("all");
  const [status, setStatus] = useState(initialStatus);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "model", desc: false },
  ]);
  const [visibility, setVisibility] = useState({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const sizes = useMemo(
    () =>
      [
        ...new Set(
          products.flatMap((p) =>
            LOCATIONS.flatMap((l) => p.sizes[l.key].map((s) => s.size)),
          ),
        ),
      ].sort((a, b) => a.localeCompare(b, "fr", { numeric: true })),
    [products],
  );
  const data = useMemo(
    () =>
      products.filter(
        (p) =>
          (location === "all" ||
            p.units[location as keyof typeof p.units] > 0) &&
          (status === "all" || (status === "low" ? isLow(p) : isOut(p))) &&
          (size === "all" ||
            LOCATIONS.filter(
              (l) => location === "all" || l.key === location,
            ).some((l) =>
              p.sizes[l.key].some((s) => s.size === size && s.quantity > 0),
            )),
      ),
    [products, location, status, size],
  );
  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      {
        id: "index",
        header: "#",
        cell: ({ row, table }) => (
          <span className="text-xs text-muted-foreground">
            {table.getSortedRowModel().rows.findIndex((r) => r.id === row.id) +
              1}
          </span>
        ),
        enableHiding: false,
      },
      {
        accessorKey: "model",
        header: ({ column }) => (
          <button
            className="flex items-center gap-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Produit
            <ArrowUpDown size={12} />
          </button>
        ),
        cell: ({ row }) => (
          <Link
            href={`/inventory/${row.original.slug}`}
            className="flex items-center gap-3"
          >
            <ProductImage src={row.original.image} alt={row.original.model} />
            <span className="max-w-[260px] text-xs font-medium leading-5">
              {row.original.model}
            </span>
          </Link>
        ),
        enableHiding: false,
      },
      {
        id: "sizes",
        header: "Taille",
        cell: ({ row }) => (
          <div className="flex max-w-[160px] flex-wrap gap-1">
            {[
              ...new Set(
                LOCATIONS.flatMap((l) =>
                  row.original.sizes[l.key].map((s) => s.size),
                ),
              ),
            ]
              .slice(0, 4)
              .map((s) => (
                <Badge
                  key={s}
                  variant="secondary"
                  className="rounded-md px-1.5 font-normal text-[10px]"
                >
                  {s}
                </Badge>
              ))}
          </div>
        ),
      },
      ...LOCATIONS.map((l) => ({
        id: l.key,
        accessorFn: (p: Product) => p.units[l.key],
        header: l.label,
        cell: ({ getValue }: { getValue: () => unknown }) => (
          <span
            className={`text-xs tabular-nums ${getValue() === 0 ? "text-rose-500" : ""}`}
          >
            {fmt(getValue() as number)}
          </span>
        ),
      })),
      {
        accessorKey: "total",
        header: "Total",
        cell: ({ row }) => (
          <span className="text-xs font-bold tabular-nums">
            {fmt(row.original.total)}
          </span>
        ),
      },
      {
        id: "status",
        header: "Statut",
        cell: ({ row }) => <StatusTag product={row.original} />,
      },
      {
        id: "action",
        header: "Détails",
        enableHiding: false,
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="icon">
            <Link
              href={`/inventory/${row.original.slug}`}
              aria-label={`Détails de ${row.original.model}`}
            >
              <ArrowUpRight size={16} />
            </Link>
          </Button>
        ),
      },
    ],
    [],
  );
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter: search,
      columnVisibility: visibility,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _id, value) =>
      row.original.model
        .toLocaleLowerCase("fr")
        .includes(String(value).trim().toLocaleLowerCase("fr")),
  });
  const count = table.getFilteredRowModel().rows.length;
  function exportCsv() {
    const rows = table.getSortedRowModel().rows;
    const csv = [
      "Produit;Stock Casa;Casablanca;Tanger;Total",
      ...rows.map(({ original: p }) =>
        [p.model, p.units.stockCasa, p.units.casa, p.units.tanger, p.total]
          .map((v) => '"' + String(v).replaceAll('"', '""') + '"')
          .join(";"),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "footmb-inventaire.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeading
        title="Inventaire"
        description="Consultez votre stock par boutique, suivez les niveaux et anticipez vos réapprovisionnements."
      />
      <Surface className="mb-4 p-4 sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-3.5" />
            <Input
              aria-label="Rechercher un produit"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
              placeholder="Rechercher un produit…"
              className="h-11 bg-[#f7f8fc] pl-10 text-xs shadow-none"
            />
          </div>
          <Tabs
            value={location}
            onValueChange={(v) => {
              setLocation(v);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
          >
            <TabsList className="grid h-11 w-full grid-cols-4 gap-1 bg-transparent p-0">
              {[{ key: "all", short: "Tous" }, ...LOCATIONS].map((l) => (
                <TabsTrigger
                  key={l.key}
                  value={l.key}
                  className="h-11 min-w-0 rounded-md bg-muted px-1 text-[10px] data-[state=active]:bg-primary data-[state=active]:text-white sm:text-xs"
                >
                  {l.key === "all"
                    ? "Tous"
                    : LOCATIONS.find((loc) => loc.key === l.key)?.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 min-[375px]:grid-cols-2 md:grid-cols-3">
          <FilterSelect
            value={size}
            onChange={(v) => {
              setSize(v);
              table.setPageIndex(0);
            }}
            label="Taille / variante"
            options={[
              { value: "all", label: "Toutes les tailles" },
              ...sizes.map((s) => ({ value: s, label: s })),
            ]}
          />
          <FilterSelect
            value={status}
            onChange={(v) => {
              setStatus(v);
              table.setPageIndex(0);
            }}
            label="Disponibilité"
            options={[
              { value: "all", label: "Tous les statuts" },
              { value: "low", label: "Stock faible" },
              { value: "out", label: "Rupture" },
            ]}
          />
          <div className="min-[375px]:col-span-2 md:col-span-1">
            <FilterSelect
              value={
                sorting[0]?.id === "total"
                  ? sorting[0]?.desc
                    ? "most"
                    : "least"
                  : "name"
              }
              onChange={(v) =>
                setSorting([
                  { id: v === "name" ? "model" : "total", desc: v === "most" },
                ])
              }
              label="Trier par"
              options={[
                { value: "name", label: "Nom (A – Z)" },
                { value: "least", label: "Stock (du plus faible)" },
                { value: "most", label: "Stock (du plus élevé)" },
              ]}
            />
          </div>
        </div>
      </Surface>
      <Surface>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className="rounded-md bg-orange-50 p-2 text-orange-500">
              <SlidersHorizontal size={18} />
            </span>
            Liste des produits{" "}
            <span className="font-normal text-muted-foreground">
              ({ready ? fmt(count) : "—"})
            </span>
          </h2>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="hidden lg:flex">
                  <SlidersHorizontal size={14} />
                  Colonnes
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {table
                  .getAllLeafColumns()
                  .filter((c) => c.getCanHide())
                  .map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={c.getIsVisible()}
                      onCheckedChange={(v) => c.toggleVisibility(v)}
                    >
                      {(
                        {
                          sizes: "Taille",
                          casa: "Casablanca",
                          tanger: "Tanger",
                          stockCasa: "Stock Casa",
                          total: "Total",
                          status: "Statut",
                        } as Record<string, string>
                      )[c.id] || c.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              disabled={!ready || !count}
              onClick={exportCsv}
            >
              <Download size={15} />
              Exporter
            </Button>
          </div>
        </div>
        {!ready && syncing ? (
          <div className="p-4">
            <LoadingPanel />
          </div>
        ) : !count ? (
          <>
            <EmptyPanel
              title={ready ? "Aucun produit trouvé" : "Inventaire indisponible"}
              detail={
                ready
                  ? "Modifiez la recherche ou les filtres pour retrouver vos produits."
                  : "Les produits apparaîtront après une synchronisation Shopify réussie."
              }
            />
            {ready && (
              <div className="pb-5 text-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setLocation("all");
                    setSize("all");
                    setStatus("all");
                  }}
                >
                  Effacer les filtres
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="hidden px-3 lg:block">
              <Table className="text-xs">
                <TableHeader className="bg-muted/80">
                  {table.getHeaderGroups().map((h) => (
                    <TableRow key={h.id}>
                      {h.headers.map((c) => (
                        <TableHead
                          key={c.id}
                          className="h-9 text-[10px] font-normal"
                        >
                          {flexRender(
                            c.column.columnDef.header,
                            c.getContext(),
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="py-2">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="grid gap-3 px-3 sm:grid-cols-2 lg:hidden">
              {table.getRowModel().rows.map((row) => (
                <ProductCard key={row.id} product={row.original} />
              ))}
            </div>
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <span
            aria-live="polite"
            className="text-[11px] text-muted-foreground"
          >
            {count
              ? `${pagination.pageIndex * pagination.pageSize + 1}–${Math.min((pagination.pageIndex + 1) * pagination.pageSize, count)} sur ${fmt(count)} produits`
              : "Aucun produit affiché"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-9"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              aria-label="Page précédente"
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-xs text-white">
              {pagination.pageIndex + 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-9"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              aria-label="Page suivante"
            >
              <ChevronRight size={16} />
            </Button>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger
                className="h-9! w-[110px] text-xs"
                aria-label="Produits par page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} par page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Surface>
      <DataDisclaimer />
    </>
  );
}
function InventoryRoute() {
  const query = useSearchParams();
  const q = query.get("q") || "";
  const filter = query.get("filter") || "all";
  return (
    <InventoryView
      key={q + "|" + filter}
      initialSearch={q}
      initialStatus={["low", "out"].includes(filter) ? filter : "all"}
    />
  );
}
export default function InventoryPage() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <InventoryRoute />
    </Suspense>
  );
}
