"use client";

import { useInventory } from "@/components/inventory-provider";
import { Icon } from "@/components/icons";
import { PageHeading, Surface } from "@/components/ui";
import { LOCATIONS, formatSync } from "@/lib/inventory";
import { signOut } from "next-auth/react";

function SettingsRow({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-white/[0.06] py-4 last:border-b-0">
    <div className="min-w-0"><p className="text-sm font-semibold">{title}</p>{detail && <p className="mt-1 text-[11px] leading-5 text-[#81909b]">{detail}</p>}</div>
    <span className="max-w-full break-all text-xs font-bold text-[#53e8b3]">{value}</span>
  </div>;
}

export default function SettingsPage() {
  const { syncing, ready, error, syncedAt, refresh } = useInventory();
  return <div>
    <PageHeading eyebrow="FOOTMB / Préférences" title="Réglages"
      description="Informations de connexion et options de consultation."/>
    <div className="space-y-4">
      <Surface className="p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2"><Icon name="store" size={19} className="text-[#49e6ac]"/><h2 className="text-base font-bold">Boutique Shopify</h2></div>
        <SettingsRow title="Boutique" value="FOOTMB" detail="Source des données d'inventaire"/>
        <SettingsRow title="Domaine Shopify" value="pc1vyq-5e.myshopify.com"/>
        <SettingsRow title="Mode" value="Lecture seule" detail="Aucune modification des quantités depuis cette interface"/>
        <div className="pt-3">
          <p className="mb-3 text-xs font-semibold text-[#8996a3]">Emplacements actifs</p>
          <div className="flex flex-wrap gap-2">{LOCATIONS.map((loc) => <span key={loc.key} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold">{loc.label}</span>)}</div>
        </div>
      </Surface>
      <Surface className="p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2"><Icon name="refresh" size={19} className="text-[#49e6ac]"/><h2 className="text-base font-bold">Synchronisation</h2></div>
        <SettingsRow title="Statut" value={error ? "Erreur" : syncing ? "En cours" : ready ? "Synchronisé" : "Non chargé"}/>
        <SettingsRow title="Dernière mise à jour" value={formatSync(syncedAt)}/>
        <button type="button" onClick={refresh} disabled={syncing}
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-[#10151b] transition hover:bg-[#e5e8eb] disabled:opacity-40 sm:w-auto sm:px-6">
          <Icon name="refresh" size={18} className={syncing ? "animate-spin" : ""}/> {syncing ? "Synchronisation…" : "Actualiser Shopify"}
        </button>
      </Surface>
      <Surface className="p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2"><Icon name="shield" size={19} className="text-amber-300"/><h2 className="text-base font-bold">Sécurité & accès</h2></div>
        <p className="text-xs leading-6 text-[#acb8c2]">
          Connexion sécurisée par Auth.js. Les pages et API Shopify nécessitent une session valide.
          Le jeton Shopify reste uniquement sur le serveur.
        </p>
        <button type="button" onClick={() => void signOut({ redirectTo: "/login" })}
          className="mt-4 min-h-12 w-full rounded-xl border border-white/15 bg-white/[0.05] px-4 text-sm font-semibold text-white hover:bg-white/10 sm:w-auto">
          Se déconnecter
        </button>
      </Surface>
      <p className="text-center text-[11px] text-[#72808c]">FOOTMB Inventory Hub · Interface v3.0</p>
    </div>
  </div>;
}
