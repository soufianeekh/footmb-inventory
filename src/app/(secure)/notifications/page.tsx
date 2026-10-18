"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Check, CheckCheck, CircleAlert, PackageCheck, RefreshCw, ShoppingBag, X } from "lucide-react";
import { PageHeading, Surface } from "@/components/ui";
import { Button } from "@/components/ui/button";

type Notice = { id: string; kind: string; title: string; body: string; resourceType: string | null; resourceId: string | null; severity: string; createdAt: string; readAt: string | null };
const icon = (kind: string) => kind.startsWith("shopify.order") ? ShoppingBag : kind.startsWith("customer_alert") ? PackageCheck : CircleAlert;

export default function NotificationsPage() {
  const [items, setItems] = useState<Notice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Notifications indisponibles");
      setItems(body.notifications as Notice[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Notifications indisponibles"); }
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/notifications", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Notifications indisponibles");
      if (active) { setItems(body.notifications as Notice[]); setError(""); }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Notifications indisponibles"); });
    return () => { active = false; };
  }, []);

  async function update(id: string, action: "read" | "dismiss") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Modification impossible");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Modification impossible"); }
    finally { setBusy(false); }
  }

  const unread = items.filter((item) => !item.readAt).length;
  return <div className="space-y-6">
    <PageHeading title="Notifications" description="Les événements utiles de la boutique et les nouvelles commandes Shopify." action={<Button variant="outline" onClick={() => void load()}><RefreshCw size={15}/> Actualiser</Button>}/>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    <Surface className="p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Boîte de réception</h2><p className="mt-1 text-xs text-muted-foreground">Les notifications restent liées à votre compte.</p></div><span className="rounded-full bg-[#fff4e5] px-3 py-1.5 text-xs font-medium text-[#b66a00]">{unread} non lue(s)</span></div>
      <div className="space-y-3">
        {items.map((item) => { const ItemIcon = icon(item.kind); return <article key={item.id} className={`rounded-lg border p-4 ${item.readAt ? "bg-white" : "border-[#ffdaa7] bg-[#fffaf2]"}`}>
          <div className="flex items-start gap-3"><span className="rounded-lg bg-white p-2.5 text-primary shadow-sm"><ItemIcon size={18}/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{item.title}</h3>{!item.readAt && <span className="size-2 rounded-full bg-[#ff9500]" aria-label="Non lue"/>}</div><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p><p className="mt-2 text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleString("fr-FR")}</p></div><div className="flex shrink-0 gap-1">{!item.readAt && <Button variant="ghost" size="icon-sm" disabled={busy} aria-label="Marquer comme lue" onClick={() => void update(item.id, "read")}><Check size={16}/></Button>}<Button variant="ghost" size="icon-sm" disabled={busy} aria-label="Masquer la notification" onClick={() => void update(item.id, "dismiss")}><X size={16}/></Button></div></div>
        </article>; })}
        {!items.length && <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed text-center"><span className="mb-3 rounded-full bg-muted p-3"><Bell size={20}/></span><p className="text-sm font-semibold">Aucune notification</p><p className="mt-1 max-w-sm text-xs text-muted-foreground">Les nouvelles commandes et événements Shopify apparaîtront ici.</p></div>}
      </div>
      {unread > 0 && <div className="mt-4 flex justify-end"><Button variant="outline" size="sm" disabled={busy} onClick={async () => { for (const item of items.filter((entry) => !entry.readAt)) await update(item.id, "read"); }}><CheckCheck size={15}/> Tout marquer comme lu</Button></div>}
    </Surface>
  </div>;
}
