"use client";

import { useState } from "react";
import Link from "next/link";

export function AcceptInviteForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (password !== confirm) return setError("Les mots de passe ne correspondent pas");
    setLoading(true); setError(null);
    const response = await fetch("/api/invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) setError(body.error || "Activation impossible"); else setDone(true);
    setLoading(false);
  };
  if (done) return <div className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">Compte activé. <Link className="font-semibold underline" href="/login">Se connecter</Link></div>;
  return <div className="mt-6 space-y-4"><input type="password" autoComplete="new-password" minLength={10} maxLength={512} className="min-h-12 w-full rounded-lg border px-4" placeholder="Mot de passe (10 caractères minimum)" value={password} onChange={(event) => setPassword(event.target.value)} /><input type="password" autoComplete="new-password" minLength={10} maxLength={512} className="min-h-12 w-full rounded-lg border px-4" placeholder="Confirmer le mot de passe" value={confirm} onChange={(event) => setConfirm(event.target.value)} />{error && <p className="text-sm text-rose-600">{error}</p>}<button className="min-h-12 w-full rounded-lg bg-[#19165c] px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={loading || !token || password.length < 10} onClick={() => void submit()}>{loading ? "Activation…" : "Activer mon compte"}</button></div>;
}
