"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}
    className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#49e6ac] px-5 text-sm font-extrabold text-[#07140f] transition hover:bg-[#7aefc4] active:scale-[.99] disabled:cursor-wait disabled:opacity-60">
    {pending ? "Connexion…" : "Se connecter"}
  </button>;
}

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [error, formAction] = useActionState(loginAction, null);
  return <form action={formAction} className="mt-8 space-y-5">
    <input type="hidden" name="callbackUrl" value={callbackUrl}/>
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-[#b4c1ca]">Identifiant</span>
      <input autoComplete="username" type="text" required name="email" maxLength={254}
        placeholder="admin@footmb.local"
        className="min-h-12 w-full rounded-xl border border-white/10 bg-[#20262c] px-4 text-base text-white outline-none placeholder:text-[#71808b] focus:border-[#49e6ac]"/>
    </label>
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-[#b4c1ca]">Mot de passe</span>
      <input autoComplete="current-password" type="password" required name="password" maxLength={512}
        placeholder="Votre mot de passe"
        className="min-h-12 w-full rounded-xl border border-white/10 bg-[#20262c] px-4 text-base text-white outline-none placeholder:text-[#71808b] focus:border-[#49e6ac]"/>
    </label>
    {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-xs leading-5 text-rose-200">{error}</p>}
    <Submit/>
  </form>;
}
