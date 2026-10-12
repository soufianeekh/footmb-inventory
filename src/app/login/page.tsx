import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
export const instant = false;

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const allowed = process.env.FOOTMB_ADMIN_EMAIL?.trim().toLowerCase();
  if (allowed && session?.user?.email?.toLowerCase() === allowed) redirect("/");
  const params = await searchParams;
  const callbackUrl = params.callbackUrl || "/";
  return <main className="flex min-h-dvh items-center justify-center bg-[#090c10] px-4 py-12 text-white">
    <div className="w-full max-w-[420px]">
      <div className="mb-9 flex items-center gap-3">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-white text-[27px] font-black text-[#11151b]">F</span>
        <span><span className="block text-xl font-black tracking-tight">FOOTMB</span><span className="text-xs text-[#81909b]">Inventory Hub · Espace privé</span></span>
      </div>
      <div className="rounded-[24px] border border-white/10 bg-[#141a20] p-6 shadow-[0_20px_70px_rgba(0,0,0,.2)] sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#49e6ac]">Accès sécurisé</p>
        <h1 className="mt-3 text-2xl font-extrabold">Bienvenue</h1>
        <p className="mt-2 text-sm leading-6 text-[#97a5b1]">Connectez-vous pour consulter les stocks des boutiques FOOTMB.</p>
        <LoginForm callbackUrl={callbackUrl}/>
      </div>
      <p className="mt-6 text-center text-xs text-[#73818e]">Réservé aux utilisateurs autorisés · Données Shopify</p>
    </div>
  </main>;
}
