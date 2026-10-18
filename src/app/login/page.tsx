import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LoginForm } from "./login-form";
import Image from "next/image";
import logo from "../../../public/footmb-logo.png";
import { safeCallbackPath } from "@/lib/auth-session";
export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const callbackUrl = safeCallbackPath(params.callbackUrl);
  const session = await auth();
  if (session?.user?.email) redirect(callbackUrl);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f5f7fb] px-4 py-12 text-[#111244]">
      <div className="w-full max-w-[430px]">
        <div className="mb-8 flex items-center gap-3">
          <Image
            src={logo}
            alt="FOOTMB"
            width={58}
            height={58}
            className="size-14 rounded-xl object-contain"
          />
          <span>
            <span className="block text-xl font-black italic tracking-tight">
              FOOT<span className="text-[#ff9d0a]">MB</span>
            </span>
            <span className="text-xs text-muted-foreground">
              Inventory · Espace privé
            </span>
          </span>
        </div>
        <div className="rounded-2xl border border-[#e4e7f0] bg-white p-6 shadow-[0_18px_50px_rgba(25,22,92,.08)] sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#f29a11]">
            Accès sécurisé
          </p>
          <h1 className="mt-3 text-2xl font-bold">Bienvenue</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Connectez-vous pour consulter les stocks des boutiques FOOTMB.
          </p>
          <LoginForm callbackUrl={callbackUrl} />
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Réservé aux utilisateurs autorisés · Données Shopify
        </p>
      </div>
    </main>
  );
}
