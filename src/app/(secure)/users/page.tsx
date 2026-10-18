"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeading, Surface } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icons";
import type { PublicUser, UserRole } from "@/lib/users";

const stores = [
  { key: "stockCasa", label: "Stock" },
  { key: "casa", label: "Casa" },
  { key: "tanger", label: "Tanger" },
];
type Activity = { id: string; action: string; outcome: string; resourceType: string; resourceId: string | null; occurredAt: string };

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("fr-MA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Jamais";
}

export default function UsersPage() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<PublicUser | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [form, setForm] = useState({ name: "", email: "", role: "reader" as Exclude<UserRole, "builder">, active: true, storeKeys: ["stockCasa"] });

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/users", { cache: "no-store" });
    const body = (await response.json()) as { users?: PublicUser[]; error?: string };
    if (!response.ok) setError(body.error || "Chargement impossible");
    else setUsers(body.users || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/users", { cache: "no-store" })
      .then((response) => response.json().then((body: { users?: PublicUser[]; error?: string }) => ({ response, body })))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok) setError(body.error || "Chargement impossible");
        else setUsers(body.users || []);
        setLoading(false);
      })
      .catch(() => { if (active) { setError("Chargement impossible"); setLoading(false); } });
    return () => { active = false; };
  }, []);

  const submitInvite = async () => {
    setSaving(true); setError(null); setInviteUrl(null);
    try {
      const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = (await response.json()) as { inviteUrl?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "Invitation impossible");
      setInviteUrl(body.inviteUrl || null);
      setForm({ name: "", email: "", role: "reader", active: true, storeKeys: ["stockCasa"] });
      await loadUsers();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invitation impossible"); }
    finally { setSaving(false); }
  };

  const patchUser = async (user: PublicUser, changes: Record<string, unknown>) => {
    setError(null);
    const response = await fetch(`/api/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) setError(body.error || "Modification impossible");
    else await loadUsers();
  };

  const viewActivity = async (user: PublicUser) => {
    setSelected(user); setActivity([]);
    const response = await fetch(`/api/users/${user.id}/activity`, { cache: "no-store" });
    if (response.ok) setActivity(((await response.json()) as { activity: Activity[] }).activity);
  };

  return <div>
    <PageHeading title="Utilisateurs" description="Invitez les employés, attribuez leurs magasins et contrôlez leurs accès." />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{users.filter((user) => user.active).length} actifs</Badge>
        <Badge variant="secondary">{users.filter((user) => user.invitationPending).length} invitations</Badge>
      </div>
      <Button onClick={() => setShowForm((value) => !value)}><Icon name="users" size={16} />Inviter un employé</Button>
    </div>
    {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {showForm && <Surface className="mb-5 p-4 sm:p-5">
      <div className="mb-4"><h2 className="font-semibold">Nouvelle invitation</h2><p className="mt-1 text-xs text-muted-foreground">Le lien expire après 48 heures. Le mot de passe est choisi par l’employé.</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Input aria-label="Nom complet" placeholder="Nom complet" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <Input aria-label="Adresse e-mail" type="email" placeholder="Adresse e-mail" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <select aria-label="Rôle" className="h-9 rounded-md border bg-white px-3 text-sm" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Exclude<UserRole, "builder"> })}>
          <option value="reader">Lecteur</option><option value="editor">Éditeur</option><option value="admin">Admin</option>
        </select>
        <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Compte actif</label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold">Magasins attribués</span>
        {stores.map((store) => <label key={store.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.storeKeys.includes(store.key)} onChange={(event) => setForm({ ...form, storeKeys: event.target.checked ? [...form.storeKeys, store.key] : form.storeKeys.filter((key) => key !== store.key) })} />{store.label}</label>)}
        <Button className="ml-auto" disabled={saving || !form.name || !form.email} onClick={() => void submitInvite()}>{saving ? "Création…" : "Créer l’invitation"}</Button>
      </div>
      {inviteUrl && <div className="mt-4 flex flex-col gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 sm:flex-row sm:items-center"><span className="min-w-0 flex-1 break-all">{inviteUrl}</span><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>Copier le lien</Button></div>}
    </Surface>}
    <Surface className="overflow-hidden">
      <div className="hidden grid-cols-[1.5fr_.7fr_1fr_.9fr_auto] gap-4 border-b bg-[#f8f9fc] px-5 py-3 text-xs font-semibold text-muted-foreground md:grid"><span>Employé</span><span>Rôle</span><span>Magasins</span><span>Dernière connexion</span><span>Actions</span></div>
      {loading ? <p className="p-6 text-sm text-muted-foreground">Chargement…</p> : users.map((user) => <div key={user.id} className="grid gap-3 border-b px-4 py-4 last:border-b-0 md:grid-cols-[1.5fr_.7fr_1fr_.9fr_auto] md:items-center md:px-5">
        <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-semibold">{user.name}</p>{!user.active && <Badge variant="secondary">Désactivé</Badge>}{user.invitationPending && <Badge className="bg-amber-50 text-amber-700">Invitation</Badge>}</div><p className="truncate text-xs text-muted-foreground">{user.email}</p></div>
        <div>{user.role === "builder" ? <Badge>Builder</Badge> : <select aria-label={`Rôle de ${user.name}`} className="h-8 rounded-md border bg-white px-2 text-xs" value={user.role} onChange={(event) => void patchUser(user, { role: event.target.value })}><option value="reader">Lecteur</option><option value="editor">Éditeur</option><option value="admin">Admin</option></select>}</div>
        <div className="flex flex-wrap gap-1">{user.role === "builder" ? <Badge variant="secondary">Tous</Badge> : stores.map((store) => <button key={store.key} className={`rounded-full border px-2 py-1 text-[10px] ${user.storeKeys.includes(store.key) ? "border-[#ff9d0a] bg-[#fff5e7]" : "bg-white text-muted-foreground"}`} onClick={() => void patchUser(user, { storeKeys: user.storeKeys.includes(store.key) ? user.storeKeys.filter((key) => key !== store.key) : [...user.storeKeys, store.key] })}>{store.label}</button>)}</div>
        <p className="text-xs text-muted-foreground">{formatDate(user.lastLoginAt)}</p>
        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void viewActivity(user)}>Historique</Button>{user.role !== "builder" && <Button size="sm" variant="ghost" onClick={() => void patchUser(user, { active: !user.active })}>{user.active ? "Désactiver" : "Activer"}</Button>}</div>
      </div>)}
    </Surface>
    {selected && <Surface className="mt-5 p-4 sm:p-5"><div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-semibold">Historique · {selected.name}</h2><p className="text-xs text-muted-foreground">Identité fiable : {selected.id}</p></div><Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Fermer</Button></div>{activity.length ? <div className="space-y-2">{activity.map((item) => <div key={item.id} className="grid gap-1 rounded-lg border p-3 text-xs sm:grid-cols-[1fr_auto]"><div><p className="font-semibold">{item.action}</p><p className="text-muted-foreground">{item.resourceType}{item.resourceId ? ` · ${item.resourceId}` : ""}</p></div><div className="sm:text-right"><Badge variant="secondary">{item.outcome}</Badge><p className="mt-1 text-muted-foreground">{formatDate(item.occurredAt)}</p></div></div>)}</div> : <p className="text-sm text-muted-foreground">Aucune activité enregistrée.</p>}</Surface>}
  </div>;
}
