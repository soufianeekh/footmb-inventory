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
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/components/user-context";
import type { PublicUser } from "@/lib/users";

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
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [userError, setUserError] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role: "reader" as "reader" | "editor" });

  useEffect(() => {
    if (currentUser.role !== "admin") {
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

  const loadUsers = async () => {
    if (currentUser.role !== "admin") return;
    const response = await fetch("/api/users", { cache: "no-store" });
    if (response.ok) setUsers(((await response.json()) as { users: PublicUser[] }).users);
  };
  useEffect(() => {
    let active = true;
    if (currentUser.role === "admin") {
      fetch("/api/users", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((body: { users?: PublicUser[] } | null) => {
          if (active && body?.users) setUsers(body.users);
        })
        .catch(() => undefined);
    }
    return () => { active = false; };
  }, [currentUser.role]);

  const addUser = async () => {
    setCreatingUser(true);
    setUserError(null);
    try {
      const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(userForm) });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Création impossible");
      setUserForm({ name: "", email: "", password: "", role: "reader" });
      await loadUsers();
    } catch (error) { setUserError(error instanceof Error ? error.message : "Création impossible"); }
    finally { setCreatingUser(false); }
  };

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
            {currentUser.role === "admin" && (
              <Button variant="outline" onClick={() => void reconcile()} disabled={reconciling}>
                <Icon name="refresh" size={16} className={reconciling ? "animate-spin" : ""} />
                Vérifier les nouveautés
              </Button>
            )}
          </div>
        </Surface>
        {currentUser.role === "admin" && (
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
        {currentUser.role === "admin" && (
          <Surface className="p-4 sm:p-5 lg:col-span-2">
            <SectionHead icon="shield" title="Utilisateurs et profils" detail="Créez des accès Lecteur ou Éditeur. Les mots de passe sont hachés côté serveur." />
            <Separator />
            <div className="grid gap-3 py-4 md:grid-cols-5">
              <Input placeholder="Nom" value={userForm.name} onChange={(event) => setUserForm((form) => ({ ...form, name: event.target.value }))} />
              <Input type="email" placeholder="E-mail" value={userForm.email} onChange={(event) => setUserForm((form) => ({ ...form, email: event.target.value }))} />
              <Input type="password" placeholder="Mot de passe (10+ caractères)" value={userForm.password} onChange={(event) => setUserForm((form) => ({ ...form, password: event.target.value }))} />
              <select className="h-9 rounded-md border bg-white px-3 text-sm" value={userForm.role} onChange={(event) => setUserForm((form) => ({ ...form, role: event.target.value as "reader" | "editor" }))}>
                <option value="reader">Lecteur</option>
                <option value="editor">Éditeur</option>
              </select>
              <Button disabled={creatingUser} onClick={() => void addUser()}>{creatingUser ? "Création…" : "Ajouter"}</Button>
            </div>
            {userError && <p className="mb-3 text-xs font-medium text-rose-600">{userError}</p>}
            <div className="divide-y rounded-lg border">
              {users.map((user) => (
                <div key={user.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1"><p className="font-medium">{user.name}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div>
                  <Badge variant="secondary">{user.role === "admin" ? "Administrateur" : user.role === "editor" ? "Éditeur" : "Lecteur"}</Badge>
                  {user.role !== "admin" && <Button size="sm" variant="ghost" onClick={async () => { await fetch("/api/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email }) }); await loadUsers(); }}>Supprimer</Button>}
                </div>
              ))}
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
