"use client";

import { useEffect, useMemo, useState } from "react";
import { useInventory } from "@/components/inventory-provider";
import { useCurrentUser } from "@/components/user-context";
import { LOCATIONS, type LocationKey, type InventoryVariant } from "@/lib/inventory";
import { PageHeading, ProductImage, Surface, LoadingPanel } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CartLine = { variant: InventoryVariant; location: LocationKey; quantity: number };
type SaleHistory = { id: string; source: "delivery" | "store"; createdAt: string; actor: { name: string }; lines: Array<{ productName: string; size: string; quantity: number; location: LocationKey }> };

export default function PosPage() {
  const { products, variants, ready, refresh } = useInventory();
  const user = useCurrentUser();
  const canEdit = user.role === "editor" || user.role === "admin" || user.role === "builder";
  const authorizedLocations = user.role === "builder" ? LOCATIONS : LOCATIONS.filter((item) => user.storeKeys.includes(item.key));
  const [query, setQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [location, setLocation] = useState<LocationKey>("stockCasa");
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [source, setSource] = useState<"store" | "delivery">("store");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<SaleHistory[]>([]);

  const loadHistory = async () => {
    const response = await fetch("/api/pos/sales", { cache: "no-store" });
    if (response.ok) setHistory(((await response.json()) as { sales: SaleHistory[] }).sales);
  };
  useEffect(() => {
    let active = true;
    fetch("/api/pos/sales", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body: { sales?: SaleHistory[] } | null) => { if (active && body?.sales) setHistory(body.sales); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    return products.filter((product) => {
      if (!normalized || product.model.toLocaleLowerCase("fr").includes(normalized)) return true;
      return variants.some((variant) => variant.productId === product.id && [variant.sku, variant.barcode].some((value) => value?.toLocaleLowerCase("fr").includes(normalized)));
    });
  }, [products, variants, query]);
  const selectedVariants = variants.filter((variant) => variant.productId === selectedProductId && variant.tracked);
  const availableLocations = authorizedLocations.filter((item) =>
    selectedVariants.some((variant) => variant.stock[item.key] > 0),
  );
  const activeLocation = availableLocations.some((item) => item.key === location)
    ? location
    : availableLocations[0]?.key || location;
  const availableVariants = selectedVariants.filter(
    (variant) => variant.stock[activeLocation] > 0,
  );
  const selectedVariant = availableVariants.find((variant) => variant.variantId === selectedVariantId) || availableVariants[0];
  const available = selectedVariant?.stock[activeLocation] || 0;

  const openProduct = (productId: string) => {
    const productVariants = variants.filter(
      (variant) => variant.productId === productId && variant.tracked,
    );
    const firstLocation =
      authorizedLocations.find((item) =>
        productVariants.some((variant) => variant.stock[item.key] > 0),
      )?.key || "stockCasa";
    const first = productVariants.find((variant) => variant.stock[firstLocation] > 0);
    setSelectedProductId(productId);
    setSelectedVariantId(first?.variantId || "");
    setLocation(firstLocation);
    setQuantity(1);
    setMessage(null);
  };
  const addLine = () => {
    if (!selectedVariant || quantity < 1 || quantity > available) return;
    setCart((current) => {
      const index = current.findIndex((line) => line.variant.variantId === selectedVariant.variantId && line.location === activeLocation);
      if (index < 0) return [...current, { variant: selectedVariant, location: activeLocation, quantity }];
      const next = [...current];
      next[index] = { ...next[index], quantity: Math.min(available, next[index].quantity + quantity) };
      return next;
    });
    setSelectedProductId(null);
  };
  const submit = async () => {
    if (!cart.length || !canEdit) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/pos/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          source,
          lines: cart.map((line) => ({
            variantId: line.variant.variantId,
            location: line.location,
            quantity: line.quantity,
          })),
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "La vente a échoué");
      setCart([]);
      setMessage("Vente confirmée et stock Shopify mis à jour");
      refresh();
      await loadHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La vente a échoué");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeading title="POS" description="Enregistrez une vente et mettez à jour le stock Shopify du bon emplacement." />
      {!canEdit && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Votre profil est en lecture seule. Un Éditeur ou Administrateur doit confirmer les ventes.
        </div>
      )}
      {!ready ? <LoadingPanel rows={8} /> : (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <div>
            <div className="relative mb-4">
              <Icon name="search" size={18} className="absolute left-3 top-3 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher par produit, SKU ou code-barres…" className="h-11 bg-white pl-10" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((product) => (
                <button key={product.id} onClick={() => openProduct(product.id)} className="rounded-xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                  <ProductImage src={product.image} alt={product.model} size="lg" />
                  <p className="mt-3 line-clamp-2 min-h-10 text-sm font-semibold">{product.model}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Stock total</span>
                    <Badge variant="secondary">{product.total}</Badge>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <Surface className="h-fit p-4 xl:sticky xl:top-24">
            <div className="flex items-center gap-2"><Icon name="cart" /><h2 className="font-semibold">Vente en cours</h2></div>
            <div className="my-4 divide-y">
              {cart.length ? cart.map((line, index) => (
                <div key={`${line.variant.variantId}:${line.location}`} className="flex gap-3 py-3">
                  <ProductImage src={line.variant.image} alt={line.variant.model} />
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="truncate font-semibold">{line.variant.model}</p>
                    <p className="mt-1 text-muted-foreground">{line.variant.size} · {LOCATIONS.find((item) => item.key === line.location)?.label}</p>
                    <p className="mt-1 font-bold">Qté {line.quantity}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setCart((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Icon name="x" size={16} /></Button>
                </div>
              )) : <p className="py-10 text-center text-sm text-muted-foreground">Ajoutez des produits à la vente.</p>}
            </div>
            <label className="text-xs font-medium">Source de la vente</label>
            <select value={source} onChange={(event) => setSource(event.target.value as "store" | "delivery")} className="mt-2 h-11 w-full rounded-md border bg-white px-3 text-sm">
              <option value="store">Vente en magasin</option>
              <option value="delivery">Livraison</option>
            </select>
            {message && <p className={`mt-3 text-xs font-medium ${message.startsWith("Vente confirmée") ? "text-emerald-700" : "text-rose-600"}`}>{message}</p>}
            <Button className="mt-4 w-full" disabled={!cart.length || !canEdit || submitting} onClick={() => void submit()}>
              {submitting ? "Confirmation Shopify…" : `Confirmer ${cart.reduce((sum, line) => sum + line.quantity, 0)} unité(s)`}
            </Button>
          </Surface>
        </div>
      )}
      <Dialog open={Boolean(selectedProductId)} onOpenChange={(open) => !open && setSelectedProductId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter à la vente</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <label className="text-xs font-medium">Emplacement
              <select
                value={availableLocations.length ? activeLocation : ""}
                disabled={!availableLocations.length}
                onChange={(event) => {
                  const nextLocation = event.target.value as LocationKey;
                  const firstAvailable = selectedVariants.find(
                    (variant) => variant.stock[nextLocation] > 0,
                  );
                  setLocation(nextLocation);
                  setSelectedVariantId(firstAvailable?.variantId || "");
                  setQuantity(1);
                }}
                className="mt-2 h-11 w-full rounded-md border bg-white px-3 text-sm"
              >
                {availableLocations.length ? (
                  availableLocations.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))
                ) : (
                  <option value="">Aucun stock disponible</option>
                )}
              </select>
            </label>
            <label className="text-xs font-medium">Taille / variante
              <select
                value={selectedVariant?.variantId || ""}
                disabled={!availableVariants.length}
                onChange={(event) => { setSelectedVariantId(event.target.value); setQuantity(1); }}
                className="mt-2 h-11 w-full rounded-md border bg-white px-3 text-sm"
              >
                {availableVariants.length ? (
                  availableVariants.map((variant) => (
                    <option key={variant.variantId} value={variant.variantId}>
                      {variant.size} · {variant.stock[activeLocation]} disponible(s)
                    </option>
                  ))
                ) : (
                  <option value="">Aucune taille disponible</option>
                )}
              </select>
            </label>
            <label className="text-xs font-medium">Quantité
              <Input type="number" min={1} max={available} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-2 h-11" />
            </label>
            <p className="text-xs text-muted-foreground">Disponible: {available}</p>
            <Button disabled={!canEdit || available < 1 || quantity < 1 || quantity > available} onClick={addLine}>Ajouter à la vente</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Surface className="mt-4 p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2"><Icon name="clock" size={18} className="text-[#f29a11]" /><h2 className="text-sm font-semibold">Dernières opérations</h2></div>
        {history.length ? (
          <div className="divide-y">
            {history.slice(0, 10).map((sale) => (
              <div key={sale.id} className="flex flex-wrap items-center gap-3 py-3 text-xs">
                <Badge variant="secondary">{sale.source === "delivery" ? "Livraison" : "Magasin"}</Badge>
                <span className="min-w-0 flex-1 truncate font-medium">{sale.lines.map((line) => `${line.productName} · ${line.size} ×${line.quantity}`).join(", ")}</span>
                <span className="text-muted-foreground">{sale.actor.name}</span>
                <time className="text-muted-foreground">{new Date(sale.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</time>
              </div>
            ))}
          </div>
        ) : <p className="py-5 text-center text-sm text-muted-foreground">Aucune opération FOOTMB POS enregistrée.</p>}
      </Surface>
    </div>
  );
}
