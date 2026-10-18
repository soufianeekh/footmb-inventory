"use client";
import { useEffect, useState } from "react";
import { useInventory } from "@/components/inventory-provider";
import { Icon } from "@/components/icons";
import { PageHeading, Surface } from "@/components/ui";
import { LOCATIONS, formatSync } from "@/lib/inventory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { signOut } from "next-auth/react";
import { useCurrentUser } from "@/components/user-context";

function SettingRow({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {detail && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {detail}
          </p>
        )}
      </div>
      <span className="max-w-full break-all text-right text-xs font-semibold text-primary">
        {value}
      </span>
    </div>
  );
}
function SectionHead({
  icon,
  title,
  detail,
  status,
}: {
  icon: "store" | "refresh" | "shield";
  title: string;
  detail: string;
  status?: string;
}) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <span className="flex size-9 items-center justify-center rounded-lg bg-[#fff4e5] text-[#f29a11]">
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold sm:text-base">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
      {status && (
        <Badge className="border-0 bg-emerald-50 text-emerald-700">
          {status}
        </Badge>
      )}
    </div>
  );
}
export default function SettingsPage() {
  const currentUser = useCurrentUser();
  const {
    syncing,
    ready,
    error,
    syncedAt,
    reconciledAt,
    revision,
    syncPhase,
    refresh,
  } = useInventory();
  const [diagnostics, setDiagnostics] = useState<{
    backend: string;
    queue: { ready: number; retry: number; dead: number };
    snapshot: { variantCount: number; productCount: number } | null;
  } | null>(null);
  const [reconciling, setReconciling] = useState(false);
  useEffect(() => {
    if (currentUser.role !== "builder") {
      return;
    }
    let active = true;
    fetch("/api/inventory/diagnostics", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (active && body) setDiagnostics(body);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [revision, currentUser.role]);

  const reconcile = async () => {
    setReconciling(true);
    try {
      const response = await fetch("/api/inventory/reconcile", { method: "POST" });
      if (!response.ok) throw new Error("Reconciliation failed");
    } finally {
      setReconciling(false);
    }
  };
  return (
    <div>
      <PageHeading
        title="Réglages"
        description="Gérez la source de données, le statut de synchronisation et les accès à FOOTMB Inventory."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="p-4 sm:p-5">
          <SectionHead
            icon="store"
            title="Source Shopify"
            detail="Connexion utilisée pour alimenter l’inventaire."
            status="Connectée"
          />
          <Separator />
          <SettingRow
            title="Boutique"
            value="FOOTMB"
            detail="Source des produits et quantités"
          />
          <SettingRow title="Domaine" value="pc1vyq-5e.myshopify.com" />
          <SettingRow
            title="Mode d’accès"
            value="Lecture et écriture contrôlée"
            detail="Les Éditeurs peuvent enregistrer des sorties validées directement par Shopify."
          />
          <div className="pt-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Emplacements actifs
            </p>
            <div className="flex flex-wrap gap-2">
              {LOCATIONS.map((loc) => (
                <Badge
                  key={loc.key}
                  variant="secondary"
                  className="font-normal"
                >
                  {loc.label}
                </Badge>
              ))}
            </div>
          </div>
        </Surface>
        <Surface className="p-4 sm:p-5">
          <SectionHead
            icon="refresh"
            title="Synchronisation"
            detail="Actualisez les données visibles depuis Shopify."
            status={
              error
                ? "Erreur"
                : syncing
                  ? "En cours"
                  : ready
                    ? "Synchronisée"
                    : "En attente"
            }
          />
          <Separator />
          <SettingRow
            title="Dernière mise à jour"
            value={formatSync(syncedAt)}
            detail={`Révision ${revision || "—"} · état ${syncPhase}`}
          />
          <SettingRow
            title="Dernier contrôle Shopify"
            value={formatSync(reconciledAt)}
            detail="Les webhooks appliquent les changements en temps réel; le contrôle vérifie seulement les nouveautés."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={refresh} disabled={syncing} className="bg-primary">
              <Icon name="refresh" size={16} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Actualisation…" : "Actualiser l’instantané"}
            </Button>
            {currentUser.role === "builder" && (
              <Button variant="outline" onClick={() => void reconcile()} disabled={reconciling}>
                <Icon name="refresh" size={16} className={reconciling ? "animate-spin" : ""} />
                Vérifier les nouveautés
              </Button>
            )}
          </div>
        </Surface>
        {currentUser.role === "builder" && (
          <Surface className="p-4 sm:p-5 lg:col-span-2">
            <SectionHead
              icon="refresh"
              title="Diagnostic de synchronisation"
              detail="État protégé du cache et de la file de traitement."
              status={
                diagnostics
                  ? diagnostics.backend === "redis"
                    ? "Redis"
                    : "Mémoire locale"
                  : "Chargement"
              }
            />
            <Separator />
            <div className="grid gap-4 pt-3 sm:grid-cols-4">
              <SettingRow title="Produits en cache" value={String(diagnostics?.snapshot?.productCount ?? "—")} />
              <SettingRow title="Variantes en cache" value={String(diagnostics?.snapshot?.variantCount ?? "—")} />
              <SettingRow title="Événements en attente" value={String(diagnostics?.queue.ready ?? "—")} />
              <SettingRow title="Nouvelles tentatives / erreurs" value={`${diagnostics?.queue.retry ?? "—"} / ${diagnostics?.queue.dead ?? "—"}`} />
            </div>
          </Surface>
        )}
        <Surface className="p-4 sm:p-5 lg:col-span-2">
          <SectionHead
            icon="shield"
            title="Sécurité et accès"
            detail="Les pages et routes Shopify nécessitent une session valide."
          />
          <Separator />
          <div className="grid gap-4 pt-3 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium">Session</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Auth.js · session sécurisée
              </p>
            </div>
            <div>
              <p className="text-xs font-medium">Secrets</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Conservés côté serveur uniquement
              </p>
            </div>
            <div>
              <p className="text-xs font-medium">Accès</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Utilisateurs autorisés uniquement
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => void signOut({ redirectTo: "/login" })}
            className="mt-5"
          >
            Se déconnecter
          </Button>
        </Surface>
      </div>
      <p className="mt-5 text-center text-xs text-muted-foreground">
        FOOTMB Inventory · Interface interne avec accès par profil
      </p>
    </div>
  );
}
