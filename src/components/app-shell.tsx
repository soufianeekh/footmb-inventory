"use client";
import Link from "next/link";
import Image from "next/image";
import footmbLogo from "../../public/footmb-logo.png";
import brandReference from "../../public/brand-reference.png";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { SessionProvider, signOut } from "next-auth/react";
import {
  InventoryProvider,
  useInventory,
} from "@/components/inventory-provider";
import { Icon, type IconName } from "@/components/icons";
import {
  useSidebar,
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut, ShieldAlert } from "lucide-react";
import { UserProvider, useCurrentUser, type CurrentUser } from "@/components/user-context";
import { hasPermission, type Permission } from "@/lib/permissions";
import { safeCallbackPath, SESSION_RENEWAL_INTERVAL_SECONDS } from "@/lib/auth-session";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
const links: { href: string; label: string; icon: IconName; permission: Permission }[] = [
  { href: "/", label: "Tableau de bord", icon: "home", permission: "dashboard.read" },
  { href: "/inventory", label: "Inventaire", icon: "box", permission: "inventory.read" },
  { href: "/pos", label: "POS", icon: "cart", permission: "pos.read" },
  { href: "/stats", label: "Statistiques", icon: "chart", permission: "statistics.read" },
  { href: "/activity", label: "Activité équipe", icon: "clock", permission: "staff.activity.read" },
  { href: "/users", label: "Utilisateurs", icon: "users", permission: "staff.manage" },
  { href: "/settings", label: "Réglages", icon: "settings", permission: "settings.manage" },
];
function NavigationLink(props: React.ComponentProps<typeof Link>) {
  const { setOpenMobile } = useSidebar();
  return <Link {...props} onClick={() => setOpenMobile(false)} />;
}
function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5"
      aria-label="FOOTMB Inventory, accueil"
    >
      <span className="size-14 overflow-hidden rounded-lg">
        <Image
          src={footmbLogo}
          width={56}
          height={56}
          alt=""
          className="size-full object-contain"
        />
      </span>
      <span className="font-black italic tracking-tight text-[22px]">
        FOOT<span className="text-[#ff9d0a]">MB</span>
        <span className="block text-[9px] tracking-[.35em] not-italic">
          INVENTORY
        </span>
      </span>
    </Link>
  );
}
function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(),
    router = useRouter();
  const [search, setSearch] = useState("");
  const { ready, syncing, error, refresh, progress, authExpired } = useInventory();
  const currentUser = useCurrentUser();
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "254px" } as React.CSSProperties}
    >
      <Sidebar className="border-r">
        <SidebarHeader className="px-6 py-7">
          <Brand />
        </SidebarHeader>
        <SidebarContent className="px-4 pt-5">
          <SidebarMenu className="gap-2">
            {links.filter((link) => hasPermission(currentUser.role, link.permission)).map((l) => (
              <SidebarMenuItem key={l.href}>
                <SidebarMenuButton
                  asChild
                  isActive={
                    l.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(l.href)
                  }
                  className="h-12 rounded-lg px-4 text-[14px] data-[active=true]:border-l-4 data-[active=true]:border-[#ff9d0a] data-[active=true]:bg-[#fff5e7] data-[active=true]:font-semibold data-[active=true]:text-[#111244]"
                >
                  <NavigationLink
                    href={l.href}
                    aria-current={
                      (
                        l.href === "/"
                          ? pathname === "/"
                          : pathname.startsWith(l.href)
                      )
                        ? "page"
                        : undefined
                    }
                  >
                    <Icon name={l.icon} size={21} />
                    <span>{l.label}</span>
                  </NavigationLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-5">
          <div
            role="img"
            aria-label="FOOTMB · Équipez votre passion"
            className="aspect-square w-full rounded-lg bg-[#141331]"
            style={{
              backgroundImage: "url(" + brandReference.src + ")",
              backgroundSize: "629.565% auto",
              backgroundPosition: "3.038% 93.575%",
            }}
          />
          <p className="pt-3 text-center text-[10px] text-muted-foreground">
            Inventaire Shopify · Accès contrôlé
          </p>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-20 flex min-h-[76px] items-center gap-3 border-b bg-white/95 px-4 backdrop-blur lg:px-8">
          <SidebarTrigger
            className="md:hidden"
            aria-label="Ouvrir la navigation"
          />
          <div className="md:hidden font-black">
            FOOT<span className="text-[#ff9d0a]">MB</span>
          </div>
          <form
            className="relative hidden max-w-xl flex-1 sm:block"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/inventory?q=${encodeURIComponent(search)}`);
            }}
          >
            <Icon
              name="search"
              size={18}
              className="absolute left-3 top-3 text-muted-foreground"
            />
            <Input
              aria-label="Recherche globale"
              placeholder="Rechercher un produit, une référence…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 bg-[#f7f8fc] pl-10 shadow-none"
            />
          </form>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <Badge
              variant="secondary"
              className={`gap-1.5 px-2.5 py-1.5 text-[10px] ${error ? "bg-rose-50 text-rose-600" : ready && !syncing ? "bg-emerald-50 text-emerald-700" : ""}`}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {error
                ? "Erreur sync"
                : authExpired
                  ? "Session expirée"
                : syncing
                  ? "Chargement"
                  : ready
                    ? "Synchronisé"
                    : "En attente"}
            </Badge>
            <Button
              size="icon"
              variant="ghost"
              disabled={syncing || authExpired}
              onClick={refresh}
              aria-label="Actualiser Shopify"
            >
              <Icon
                name="refresh"
                size={18}
                className={syncing ? "animate-spin" : ""}
              />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="hidden gap-2 sm:flex">
                  <Icon name="store" size={18} />
                  FOOTMB
                  <ChevronDown size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {hasPermission(currentUser.role, "settings.manage") && (
                  <DropdownMenuItem asChild>
                    <Link href="/settings">Informations de la boutique</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => void signOut({ redirectTo: "/login" })}
                >
                  <LogOut />
                  Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div
          id="main-content"
          className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-7"
        >
          <div className="mx-auto max-w-[1440px]">
            {error && (
              <div
                role="alert"
                className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
              >
                <span>La synchronisation a échoué : {error}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refresh}
                  disabled={syncing}
                >
                  Réessayer
                </Button>
              </div>
            )}
            {syncing && (
              <p role="status" className="mb-4 text-xs text-muted-foreground">
                Synchronisation Shopify · {progress} variantes chargées
              </p>
            )}
            {authExpired ? (
              <div className="min-h-[45vh] rounded-xl border bg-white" aria-hidden="true" />
            ) : children}
          </div>
        </div>
        <Dialog open={authExpired} onOpenChange={() => undefined}>
          <DialogContent showCloseButton={false} className="sm:max-w-md">
            <DialogHeader>
              <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <ShieldAlert size={22} />
              </div>
              <DialogTitle>Session expirée</DialogTitle>
              <DialogDescription className="leading-6">
                Votre session sécurisée est terminée. La synchronisation a été arrêtée et les données d’inventaire ont été retirées de cet écran.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button className="w-full sm:w-auto" onClick={() => {
                const intended = safeCallbackPath(`${window.location.pathname}${window.location.search}`);
                router.replace(`/login?callbackUrl=${encodeURIComponent(intended)}`);
              }}>
                Se reconnecter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
export function AppShell({ children, user }: { children: React.ReactNode; user: CurrentUser }) {
  return (
    <SessionProvider refetchInterval={SESSION_RENEWAL_INTERVAL_SECONDS} refetchOnWindowFocus>
      <UserProvider user={user}>
        <InventoryProvider>
          <Chrome>{children}</Chrome>
        </InventoryProvider>
      </UserProvider>
    </SessionProvider>
  );
}
