"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { InventoryProvider, useInventory } from "@/components/inventory-provider";
import { Icon, type IconName } from "@/components/icons";
import { fmt } from "@/lib/inventory";
import { signOut } from "next-auth/react";

const links: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Accueil", icon: "home" },
  { href: "/inventory", label: "Inventaire", icon: "box" },
  { href: "/stats", label: "Stats", icon: "chart" },
  { href: "/settings", label: "Réglages", icon: "settings" },
];

function Navigation({ compact }: { compact?: boolean }) {
  const pathname = usePathname();
  return links.map((link) => {
    const active = link.href === "/" ? pathname === "/" :
      pathname === link.href || pathname.startsWith(`${link.href}/`);
    return <Link key={link.href} href={link.href}
      aria-current={active ? "page" : undefined}
      className={compact ?
        `flex h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors ${active ? "text-[#49e6ac]" : "text-[#8b96a3]"}`
        : `flex h-12 items-center gap-3 rounded-xl px-4 text-sm font-semibold transition-colors ${active ? "border border-[#49e6ac]/15 bg-[#49e6ac]/10 text-[#49e6ac]" : "text-[#a1aab4] hover:bg-white/[0.05] hover:text-white"}`
      }>
      <Icon name={link.icon} size={compact ? 21 : 19}/>
      <span>{link.label}</span>
    </Link>;
  });
}

function Chrome({ children }: { children: React.ReactNode }) {
  const { syncing, ready, error, refresh, progress, syncedAt } = useInventory();
  return <div className="min-h-dvh bg-[#090c10] text-[#f5f6f8]">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[228px] flex-col border-r border-white/[0.07] bg-[#10151b] px-3 py-5 lg:flex">
      <Link href="/" className="mb-9 flex items-center gap-3 px-3">
        <span className="flex size-11 items-center justify-center rounded-[14px] bg-white text-[23px] font-black text-[#11151b]">F</span>
        <span><span className="block text-lg font-black tracking-tight">FOOTMB</span><span className="block text-[11px] text-[#8995a2]">Inventory Hub</span></span>
      </Link>
      <div className="mb-3 px-4 text-[10px] font-bold uppercase tracking-[.17em] text-[#687582]">Workspace</div>
      <nav aria-label="Navigation principale" className="space-y-1">{<Navigation/>}</nav>
      <div className="mt-auto rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#d8e0e4]"><Icon name="shield" size={16}/> Lecture seule</div>
        <p className="mt-2 text-[11px] leading-5 text-[#8b96a3]">Les quantités viennent directement de Shopify.</p>
      </div>
      <button type="button" onClick={() => void signOut({ redirectTo: "/login" })}
        className="mt-3 min-h-11 w-full rounded-xl border border-white/10 px-4 text-left text-sm font-semibold text-[#bdcad4] hover:bg-white/5">
        Déconnexion
      </button>
    </aside>

    <div className="min-w-0 lg:pl-[228px]">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#10151b]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[66px] max-w-[1430px] items-center justify-between gap-2 px-4 sm:px-6 lg:h-[76px] lg:px-9">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 lg:hidden">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-xl font-black text-[#10151b]">F</span>
            <span className="min-w-0">
              <span className="block text-[15px] font-black leading-5 tracking-tight">FOOTMB</span>
              <span className="block text-[10px] text-[#8b96a3]">Inventory Hub</span>
            </span>
          </Link>
          <div className="hidden lg:block">
            <p className="text-sm font-semibold">Gestion du stock</p>
            <p className="mt-0.5 text-xs text-[#798693]">FOOTMB · Shopify</p>
          </div>
          <div className="flex items-center gap-2">
            <span role="status" className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[10px] font-bold sm:px-3 sm:text-xs ${
              error ? "border-amber-500/20 bg-amber-500/10 text-amber-300" :
              syncing ? "border-blue-400/20 bg-blue-400/10 text-blue-200" :
              ready ? "border-[#49e6ac]/20 bg-[#49e6ac]/10 text-[#49e6ac]" :
              "border-white/10 bg-white/5 text-[#a2afbd]"
            }`}>
              <span className={`size-1.5 rounded-full ${error ? "bg-amber-400" : syncing ? "animate-pulse bg-blue-400" : ready ? "bg-[#49e6ac]" : "bg-slate-500"}`}/>
              {error ? "Erreur sync" : syncing ? "Chargement" : ready ? "Synchronisé" : "En attente"}
            </span>
            <button type="button" onClick={refresh} disabled={syncing}
              aria-label="Actualiser depuis Shopify" title="Actualiser depuis Shopify"
              className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-[#f5f6f8] transition hover:bg-white/10 active:scale-95 disabled:opacity-40">
              <Icon name="refresh" size={20} className={syncing ? "animate-spin" : ""}/>
            </button>
          </div>
        </div>
      </header>

      <div aria-live="polite" className="mx-auto max-w-[1430px]">
        {syncing && <div className="mx-4 mt-4 rounded-xl border border-blue-400/20 bg-blue-400/[0.07] px-3.5 py-3 text-xs text-blue-200 sm:mx-6 lg:mx-9">
          Synchronisation Shopify en cours · {fmt(progress)} variantes chargées. {ready ? "Les anciennes données restent visibles." : "Préparation des données…"}
        </div>}
        {error && <div role="alert" className="mx-4 mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3.5 py-3 text-xs leading-5 text-amber-200 sm:mx-6 lg:mx-9">
          La synchronisation a échoué : {error}. {ready ? "Les dernières données reçues restent affichées." : "Vérifiez votre API Shopify et réessayez."}
        </div>}
        {ready && !syncing && syncedAt && <span className="sr-only">Dernière synchronisation à {syncedAt.toLocaleTimeString("fr-FR")}</span>}
      </div>

      <main className="mx-auto w-full min-w-0 max-w-[1430px] px-4 pb-[calc(105px+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-9 lg:pb-16 lg:pt-9">
        {children}
      </main>
    </div>

    <nav aria-label="Navigation mobile" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.09] bg-[#11171d]/98 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_36px_rgba(0,0,0,.24)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex h-[68px] max-w-[560px] items-center justify-between gap-1">
        <Navigation compact/>
      </div>
    </nav>
  </div>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <InventoryProvider><Chrome>{children}</Chrome></InventoryProvider>;
}
