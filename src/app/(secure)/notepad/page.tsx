"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, FileText, LoaderCircle, Pin, Plus, Save, Search } from "lucide-react";
import { useCurrentUser } from "@/components/user-context";
import { PageHeading, Surface } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SharedNote = { id: string; title: string; body: string; pinned: boolean; version: number; createdAt: string; updatedAt: string; createdBy: string | null; updatedBy: string | null };

export default function NotepadPage() {
  const user = useCurrentUser();
  const canWrite = user.role !== "reader";
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = notes.find((note) => note.id === selectedId) || null;

  const load = useCallback(async (keepSelection = true, preferredId?: string) => {
    setError("");
    try {
      const response = await fetch("/api/notepad", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Notes indisponibles");
      const loaded = result.notes as SharedNote[];
      setNotes(loaded);
      const next = preferredId && loaded.some((note) => note.id === preferredId)
        ? preferredId
        : keepSelection && loaded.some((note) => note.id === selectedId) ? selectedId : loaded[0]?.id || "";
      setSelectedId(next);
      const active = loaded.find((note) => note.id === next);
      setTitle(active?.title || ""); setBody(active?.body || ""); setPinned(active?.pinned || false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Notes indisponibles"); }
  }, [selectedId]);

  useEffect(() => {
    let active = true;
    fetch("/api/notepad", { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Notes indisponibles");
      if (!active) return;
      const loaded = result.notes as SharedNote[];
      setNotes(loaded);
      const first = loaded[0] || null;
      setSelectedId(first?.id || ""); setTitle(first?.title || ""); setBody(first?.body || ""); setPinned(first?.pinned || false);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Notes indisponibles"); });
    return () => { active = false; };
  }, []);

  function selectNote(note: SharedNote) {
    setSelectedId(note.id); setTitle(note.title); setBody(note.body); setPinned(note.pinned); setError("");
  }

  function newNote() {
    setSelectedId(""); setTitle(""); setBody(""); setPinned(false); setError("");
  }

  async function save() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/notepad", {
        method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected ? { id: selected.id, version: selected.version, title, body, pinned } : { title, body, pinned }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Enregistrement impossible");
      await load(false, result.note?.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible"); }
    finally { setBusy(false); }
  }

  async function archive() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/notepad", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, version: selected.version, archive: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Archivage impossible");
      newNote(); await load(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Archivage impossible"); }
    finally { setBusy(false); }
  }

  const filtered = useMemo(() => notes.filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(query.toLowerCase())), [notes, query]);

  return <div className="space-y-6">
    <PageHeading title="Notepad partagé" description="Les informations utiles à toute l’équipe, conservées dans un espace commun." action={canWrite ? <Button onClick={newNote}><Plus size={16}/> Nouvelle note</Button> : undefined}/>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span>{error.includes("modifiée") && <Button size="sm" variant="outline" onClick={() => void load(true)}>Recharger la note</Button>}</div>}
    <div className="grid gap-5 lg:grid-cols-[minmax(250px,.72fr)_minmax(0,1.28fr)]">
      <Surface className="overflow-hidden">
        <div className="border-b p-4"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-muted-foreground"/><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Rechercher dans les notes…" aria-label="Rechercher dans les notes"/></div></div>
        <div className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
          {filtered.map((note) => <button key={note.id} type="button" onClick={() => selectNote(note)} className={`w-full rounded-lg p-3 text-left transition-colors ${selectedId === note.id ? "bg-[#fff5e7]" : "hover:bg-muted/60"}`}>
            <span className="flex items-center gap-2 text-sm font-semibold">{note.pinned && <Pin size={13} className="text-[#f28a00]"/>}<span className="truncate">{note.title || "Sans titre"}</span></span>
            <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">{note.body || "Note vide"}</span>
            <span className="mt-2 block text-[10px] text-muted-foreground">Modifiée {new Date(note.updatedAt).toLocaleDateString("fr-FR")}{note.updatedBy ? ` · ${note.updatedBy}` : ""}</span>
          </button>)}
          {!filtered.length && <div className="flex min-h-36 flex-col items-center justify-center px-5 text-center"><FileText size={21} className="mb-2 text-muted-foreground"/><p className="text-sm font-medium">Aucune note trouvée</p><p className="mt-1 text-xs text-muted-foreground">{canWrite ? "Créez une note pour votre équipe." : "Les notes partagées apparaîtront ici."}</p></div>}
        </div>
      </Surface>
      <Surface className="p-4 sm:p-6">
        {canWrite ? <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{selected ? `Note · version ${selected.version}` : "Nouvelle note"}</p><p className="mt-1 text-xs text-muted-foreground">Les changements sont enregistrés seulement après validation.</p></div>{selected && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void archive()}><Archive size={15}/> Archiver</Button>}</div>
          <Input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Titre de la note" aria-label="Titre de la note"/>
          <textarea value={body} maxLength={5000} onChange={(event) => setBody(event.target.value)} placeholder="Écrivez une consigne, une information ou un rappel pour l’équipe…" className="min-h-[300px] w-full resize-y rounded-md border bg-white px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label="Contenu de la note"/>
          <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" className="accent-[#ff9500]" checked={pinned} onChange={(event) => setPinned(event.target.checked)}/><Pin size={15}/> Épingler en haut</label><Button disabled={busy || (!title.trim() && !body.trim())} onClick={() => void save()}>{busy ? <LoaderCircle className="animate-spin" size={16}/> : <Save size={16}/>} Enregistrer</Button></div>
          <p className="border-t pt-3 text-[11px] text-muted-foreground">Modifications enregistrées avec auteur et historique de versions.</p>
        </div> : selected ? <article><p className="text-xs text-muted-foreground">Note partagée · version {selected.version}</p><h2 className="mt-2 text-xl font-semibold">{selected.title || "Sans titre"}</h2><div className="mt-5 whitespace-pre-wrap text-sm leading-7">{selected.body}</div><p className="mt-8 border-t pt-3 text-xs text-muted-foreground">Mise à jour {new Date(selected.updatedAt).toLocaleString("fr-FR")}{selected.updatedBy ? ` · ${selected.updatedBy}` : ""}</p></article> : <div className="flex min-h-64 flex-col items-center justify-center text-center"><FileText size={24} className="mb-3 text-muted-foreground"/><p className="font-medium">Sélectionnez une note partagée</p></div>}
      </Surface>
    </div>
  </div>;
}
