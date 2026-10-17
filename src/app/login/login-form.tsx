"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-12 w-full items-center justify-center rounded-lg bg-[#19165c] px-5 text-sm font-semibold text-white transition hover:bg-[#29247d] active:scale-[.99] disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Connexion…" : "Se connecter"}
    </button>
  );
}

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [error, formAction] = useActionState(loginAction, null);
  return (
    <form action={formAction} className="mt-8 space-y-5">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <label className="block">
        <span className="mb-2 block text-xs font-semibold text-[#4c5571]">
          Identifiant
        </span>
        <input
          autoComplete="username"
          type="text"
          required
          name="email"
          maxLength={254}
          placeholder="admin@footmb.local"
          className="min-h-12 w-full rounded-lg border border-[#dfe4ef] bg-white px-4 text-base text-[#111244] outline-none placeholder:text-[#a0a8bb] focus:border-[#ff9d0a]"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-xs font-semibold text-[#4c5571]">
          Mot de passe
        </span>
        <input
          autoComplete="current-password"
          type="password"
          required
          name="password"
          maxLength={512}
          placeholder="Votre mot de passe"
          className="min-h-12 w-full rounded-lg border border-[#dfe4ef] bg-white px-4 text-base text-[#111244] outline-none placeholder:text-[#a0a8bb] focus:border-[#ff9d0a]"
        />
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-xs leading-5 text-rose-200"
        >
          {error}
        </p>
      )}
      <Submit />
    </form>
  );
}
