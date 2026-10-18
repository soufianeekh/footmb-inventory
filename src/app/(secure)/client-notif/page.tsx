"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Check, Clock3, ExternalLink, LoaderCircle, MessageCircle, Plus, Search, ShieldCheck, X } from "lucide-react";
import { useInventory } from "@/components/inventory-provider";
import { useCurrentUser } from "@/components/user-context";
import { LOCATIONS, type LocationKey } from "@/lib/inventory";
import { PageHeading, ProductImage, Surface } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AlertStatus = "waiting" | "available" | "notified" | "resolved" | "cancelled" | "expired";
type ClientAlert = {
  id: string; productId: string; variantId: string; locationId: string; location: LocationKey;
  size: string | null; quantity: number; channel: "phone" | "whatsapp" | "email"; contactHint: string;
  status: AlertStatus; createdAt: string; createdBy: string | null;
};

const STATUS: Record<AlertStatus, { label: string; className: string }> = {
  waiting: { label: "En attente", className: "bg-amber-50 text-amber-700" },
  available: { label: "Disponible", className: "bg-emerald-50 text-emerald-700" },
  notified: { label: "Client contacté", className: "bg-violet-50 text-violet-700" },
  resolved: { label: "Terminée", className: "bg-slate-100 text-slate-600" },
  cancelled: { label: "Annulée", className: "bg-slate-100 text-slate-600" },
  expired: { label: "Expirée", className: "bg-slate-100 text-slate-600" },
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium text-[#111244]">{label}{children}</label>;
}

function contactUrl(alert: ClientAlert, contact: string, productName: string) {
  const locationName = LOCATIONS.find((item) => item.key === alert.location)?.label || "boutique";
  const message = `Bonjour, le produit ${productName}, taille ${alert.size || "—"}, est disponible (${alert.quantity} pièce(s)) à ${locationName}.`;
  if (alert.channel === "email") return `mailto:${contact}?subject=${encodeURIComponent("Votre demande de disponibilité FOOTMB")}&body=${encodeURIComponent(message)}`;
  if (alert.channel === "phone") return `tel:${contact}`;
  let phone = contact.replace(/\D/g, "");
  if (phone.startsWith("0")) phone = `212${phone.slice(1)}`;
  else if (phone.length === 9) phone = `212${phone}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default function ClientNotifPage() {
  const { variants, ready } = useInventory();
  const user = useCurrentUser();
  const locations = useMemo(() => user.role === "builder" ? LOCATIONS : LOCATIONS.filter((item) => user.storeKeys.includes(item.key)), [user.role, user.storeKeys]);
  const [alerts, setAlerts] = useState<ClientAlert[]>([]);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [location, setLocation] = useState<LocationKey>(locations[0]?.key || "casa");
  const selectedLocation = locations.some((item) => item.key === location) ? location : locations[0]?.key || "casa";
  const [variantId, setVariantId] = useState("");
  const [channel, setChannel] = useState<"phone" | "whatsapp" | "email">("whatsapp");
  const [contact, setContact] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [consent, setConsent] = useState(false);
  const [formError, setFormError] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const products = useMemo(() => {
    const map = new Map<string, { name: string; image: string | null }>();
    variants.forEach((variant) => {
      const current = map.get(variant.productId);
      map.set(variant.productId, {
        name: variant.model,
        image: current?.image || variant.image || null,
      });
    });
    return [...map.entries()]
      .map(([id, product]) => ({ id, ...product }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
  }, [variants]);
  const selectedProductId = products.some((product) => product.id === productId) ? productId : products[0]?.id || "";
  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const filteredProducts = useMemo(() => {
    const normalizedSearch = productSearch.trim().toLocaleLowerCase("fr");
    return products
      .filter((product) => !normalizedSearch || product.name.toLocaleLowerCase("fr").includes(normalizedSearch))
      .slice(0, 50);
  }, [products, productSearch]);
  const selectedVariants = useMemo(() => variants.filter((variant) =>
    variant.productId === selectedProductId && variant.tracked && Boolean(variant.locationIds?.[selectedLocation]),
  ).sort((a, b) => a.size.localeCompare(b.size, "fr", { numeric: true })), [variants, selectedProductId, selectedLocation]);
  const selectedVariantId = selectedVariants.some((variant) => variant.variantId === variantId) ? variantId : selectedVariants[0]?.variantId || "";
  const productNames = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products]);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch(`/api/client-notif?status=${showAll ? "all" : "active"}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Demandes indisponibles");
      setAlerts(body.alerts as ClientAlert[]);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Demandes indisponibles");
    }
  }, [showAll, setAlerts, setLoadError]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filteredAlerts = alerts.filter((alert) => {
    const text = `${productNames.get(alert.productId) || alert.productId} ${alert.size || ""} ${LOCATIONS.find((item) => item.key === alert.location)?.label || ""} ${alert.contactHint}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });
  const waitingCount = alerts.filter((alert) => alert.status === "waiting").length;
  const readyCount = alerts.filter((alert) => alert.status === "available").length;

  async function createAlert(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setFormError("");
    try {
      const response = await fetch("/api/client-notif", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selectedProductId, variantId: selectedVariantId, location: selectedLocation, channel, contact, quantity, consent, idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Enregistrement impossible");
      setContact(""); setQuantity(1); setConsent(false);
      await load();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Enregistrement impossible"); }
    finally { setBusy(false); }
  }

  async function changeStatus(alert: ClientAlert, status: AlertStatus) {
    setBusy(true); setFormError("");
    try {
      const response = await fetch("/api/client-notif", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: alert.id, status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Modification impossible");
      await load();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Modification impossible"); }
    finally { setBusy(false); }
  }

  async function revealContact(alert: ClientAlert) {
    const response = await fetch(`/api/client-notif/${alert.id}/contact`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { setFormError(body.error || "Coordonnées indisponibles"); return; }
    setRevealed((current) => ({ ...current, [alert.id]: body.contact }));
  }

  return <div className="space-y-6">
    <PageHeading title="Client Notif" description="Suivez les demandes de disponibilité par produit, taille et boutique." action={<div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs text-muted-foreground shadow-sm"><ShieldCheck size={15} className="text-emerald-600"/> Coordonnées chiffrées</div>} />

    {formError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div>}
    {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{loadError}</span><Button variant="outline" size="sm" onClick={() => void load()}>Réessayer</Button></div>}

    <div className="grid gap-3 sm:grid-cols-3">
      <Surface className="p-4"><div className="flex items-center gap-3"><span className="rounded-lg bg-amber-50 p-2.5 text-amber-600"><Clock3 size={20}/></span><div><p className="text-xs text-muted-foreground">Demandes en attente</p><p className="text-2xl font-bold">{waitingCount}</p></div></div></Surface>
      <Surface className="p-4"><div className="flex items-center gap-3"><span className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600"><Check size={20}/></span><div><p className="text-xs text-muted-foreground">Stock retrouvé</p><p className="text-2xl font-bold">{readyCount}</p></div></div></Surface>
      <Surface className="p-4"><div className="flex items-center gap-3"><span className="rounded-lg bg-violet-50 p-2.5 text-violet-600"><MessageCircle size={20}/></span><div><p className="text-xs text-muted-foreground">Canaux de contact</p><p className="text-sm font-semibold">Téléphone · WhatsApp · Email</p></div></div></Surface>
    </div>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
      <Surface className="p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><span className="rounded-lg bg-[#fff4e5] p-2 text-[#f28a00]"><BellRing size={18}/></span><div><h2 className="font-semibold">Demandes clients</h2><p className="text-xs text-muted-foreground">Coordonnées masquées jusqu’à consultation autorisée</p></div></div>
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-[190px] flex-1"><Search size={16} className="absolute left-3 top-3 text-muted-foreground"/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher produit, taille…" className="pl-9" aria-label="Rechercher une demande"/></div>
          <Button variant={showAll ? "outline" : "secondary"} size="sm" onClick={() => setShowAll(false)}>À traiter</Button>
          <Button variant={showAll ? "secondary" : "outline"} size="sm" onClick={() => setShowAll(true)}>Toutes</Button>
        </div>
        <div className="space-y-3">
          {filteredAlerts.map((alert) => <article key={alert.id} className="rounded-lg border p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="font-semibold">{productNames.get(alert.productId) || "Produit"}</h3><p className="mt-1 text-xs text-muted-foreground">Taille {alert.size || "—"} · {LOCATIONS.find((item) => item.key === alert.location)?.label || "Boutique"} · Qté {alert.quantity}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS[alert.status]?.className || "bg-slate-100"}`}>{STATUS[alert.status]?.label || alert.status}</span></div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs"><div><p className="font-medium">{alert.channel === "whatsapp" ? "WhatsApp" : alert.channel === "email" ? "Email" : "Téléphone"} · {alert.contactHint}</p><p className="mt-1 text-muted-foreground">{new Date(alert.createdAt).toLocaleString("fr-FR")} {alert.createdBy ? `· ${alert.createdBy}` : ""}</p></div><div className="flex flex-wrap gap-2">
              {revealed[alert.id] ? <a className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 font-medium text-primary" href={contactUrl(alert, revealed[alert.id], productNames.get(alert.productId) || "votre produit")} target={alert.channel === "whatsapp" ? "_blank" : undefined} rel={alert.channel === "whatsapp" ? "noreferrer" : undefined}><ExternalLink size={14}/>{alert.channel === "email" ? "Écrire" : alert.channel === "whatsapp" ? "WhatsApp" : "Appeler"}</a> : <Button variant="outline" size="sm" onClick={() => void revealContact(alert)}>Voir contact</Button>}
              {alert.status === "waiting" && <Button size="sm" disabled={busy} onClick={() => void changeStatus(alert, "available")}>Stock disponible</Button>}
              {alert.status === "available" && <Button size="sm" disabled={busy} onClick={() => void changeStatus(alert, "notified")}>Client contacté</Button>}
              {(alert.status === "waiting" || alert.status === "available" || alert.status === "notified") && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void changeStatus(alert, "resolved")}>Terminer</Button>}
            </div></div>
          </article>)}
          {!filteredAlerts.length && <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed px-5 text-center"><span className="mb-3 rounded-full bg-muted p-3"><BellRing size={20}/></span><p className="text-sm font-semibold">Aucune demande à afficher</p><p className="mt-1 text-xs text-muted-foreground">Les demandes enregistrées apparaîtront ici.</p></div>}
        </div>
      </Surface>

      <Surface className="p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><span className="rounded-lg bg-primary p-2 text-white"><Plus size={18}/></span><div><h2 className="font-semibold">Nouvelle demande</h2><p className="text-xs text-muted-foreground">Enregistrez le produit et la boutique exacte</p></div></div>
        {!ready && <p className="mb-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800">Le catalogue Shopify se charge. Vous pouvez saisir les coordonnées après la synchronisation.</p>}
        <form className="space-y-4" onSubmit={createAlert}>
          <Field label="Produit">
            <div className="relative">
              <div className="relative">
                <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  role="combobox"
                  aria-label="Rechercher un produit"
                  aria-expanded={productPickerOpen}
                  aria-controls="client-notif-product-options"
                  aria-autocomplete="list"
                  autoComplete="off"
                  value={productSearch}
                  onFocus={() => setProductPickerOpen(true)}
                  onChange={(event) => { setProductSearch(event.target.value); setProductPickerOpen(true); }}
                  placeholder={selectedProduct?.name || "Rechercher un produit…"}
                  className="pl-9 pr-10"
                  required={!selectedProductId}
                />
                {productPickerOpen && <button type="button" aria-label="Fermer la liste des produits" onClick={() => { setProductPickerOpen(false); setProductSearch(""); }} className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X size={15}/></button>}
              </div>
              {productPickerOpen && <div id="client-notif-product-options" role="listbox" aria-label="Produits" className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border bg-white p-1.5 shadow-xl">
                {filteredProducts.length ? filteredProducts.map((product) => <button
                  key={product.id}
                  type="button"
                  role="option"
                  aria-selected={product.id === selectedProductId}
                  onClick={() => { setProductId(product.id); setVariantId(""); setProductSearch(""); setProductPickerOpen(false); }}
                  className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${product.id === selectedProductId ? "bg-orange-50/70" : ""}`}
                >
                  <ProductImage src={product.image} alt={product.name} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#111244]">{product.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">Choisir ce produit</span></span>
                  {product.id === selectedProductId && <Check size={16} className="shrink-0 text-emerald-600"/>}
                </button>) : <p className="px-3 py-7 text-center text-sm text-muted-foreground">Aucun produit ne correspond à « {productSearch} ».</p>}
                {filteredProducts.length === 50 && <p className="px-3 py-2 text-center text-[11px] text-muted-foreground">Affinez la recherche pour voir d’autres produits.</p>}
              </div>}
            </div>
            {selectedProduct && <div className="mt-2 flex min-w-0 items-center gap-3 rounded-lg border bg-white p-2.5">
              <ProductImage src={selectedProduct.image} alt={selectedProduct.name}/>
              <div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Produit sélectionné</p><p className="mt-0.5 truncate text-sm font-semibold text-[#111244]">{selectedProduct.name}</p></div>
              <button type="button" onClick={() => { setProductSearch(""); setProductPickerOpen(true); }} className="ml-auto shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-muted">Changer</button>
            </div>}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Boutique"><select className="h-10 rounded-md border bg-white px-3 text-sm" value={selectedLocation} onChange={(event) => setLocation(event.target.value as LocationKey)} required>{locations.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></Field><Field label="Taille / variante"><select className="h-10 rounded-md border bg-white px-3 text-sm" value={selectedVariantId} onChange={(event) => setVariantId(event.target.value)} required><option value="">Choisir une taille</option>{selectedVariants.map((variant) => <option key={variant.variantId} value={variant.variantId}>{variant.size} · {variant.stock[selectedLocation]} disponible(s)</option>)}</select></Field></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Canal"><select className="h-10 rounded-md border bg-white px-3 text-sm" value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)}><option value="whatsapp">WhatsApp</option><option value="phone">Téléphone</option><option value="email">Email</option></select></Field><Field label="Quantité demandée"><Input type="number" min={1} max={20} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required/></Field></div>
          <Field label={channel === "email" ? "Adresse email" : "Numéro de téléphone"}><Input value={contact} onChange={(event) => setContact(event.target.value)} placeholder={channel === "email" ? "client@example.com" : "+212 6…"} autoComplete="off" required/></Field>
          <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><input className="mt-1 accent-[#ff9500]" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required/><span>Le client a donné son accord pour être contacté au sujet de cette disponibilité.</span></label>
          <p className="text-[11px] leading-4 text-muted-foreground">Les coordonnées sont chiffrées dans la base. Leur consultation est réservée aux employés autorisés et journalisée. Aucun message ne sera envoyé automatiquement.</p>
          <Button type="submit" className="w-full" disabled={busy || !ready || !selectedProductId || !selectedVariantId || !locations.length}>{busy ? <LoaderCircle className="animate-spin" size={16}/> : <Plus size={16}/>} Enregistrer la demande</Button>
        </form>
      </Surface>
    </div>
  </div>;
}
