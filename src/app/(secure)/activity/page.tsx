"use client";

import { useEffect, useState } from "react";
import { PageHeading, Surface } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import type { PublicUser } from "@/lib/users";

type Activity = { id: string; action: string; outcome: string; resourceType: string; resourceId: string | null; occurredAt: string };

export default function ActivityPage() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [activity, setActivity] = useState<Activity[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/users", { cache: "no-store" }).then((response) => response.ok ? response.json() : null)
      .then((body: { users?: PublicUser[] } | null) => {
        if (!active || !body?.users) return;
        setUsers(body.users);
        setSelectedId(body.users[0]?.id || "");
      }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    fetch(`/api/users/${selectedId}/activity`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null)
      .then((body: { activity?: Activity[] } | null) => { if (active && body?.activity) setActivity(body.activity); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [selectedId]);

  return <div><PageHeading title="Activité équipe" description="Consultez les connexions, ventes et changements attribués à chaque employé." />
    <Surface className="overflow-hidden">
      <div className="border-b bg-[#f8f9fc] p-4 sm:p-5"><label className="text-xs font-semibold">Employé<select className="mt-2 block h-10 w-full max-w-sm rounded-md border bg-white px-3 text-sm" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label></div>
      <div className="divide-y">{activity.length ? activity.map((item) => <div key={item.id} className="grid gap-2 p-4 text-sm sm:grid-cols-[1fr_auto] sm:px-5"><div><p className="font-semibold">{item.action}</p><p className="mt-1 text-xs text-muted-foreground">{item.resourceType}{item.resourceId ? ` · ${item.resourceId}` : ""}</p></div><div className="sm:text-right"><Badge variant="secondary">{item.outcome}</Badge><time className="mt-1 block text-xs text-muted-foreground">{new Date(item.occurredAt).toLocaleString("fr-MA")}</time></div></div>) : <p className="p-8 text-center text-sm text-muted-foreground">Aucune activité enregistrée pour cet utilisateur.</p>}</div>
    </Surface>
  </div>;
}
