import Image from "next/image";
import logo from "../../../public/footmb-logo.png";
import { AcceptInviteForm } from "./accept-invite-form";
export const instant = false;

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <main className="flex min-h-dvh items-center justify-center bg-[#f5f7fb] px-4 py-12 text-[#111244]">
    <div className="w-full max-w-[430px] rounded-2xl border bg-white p-6 shadow-[0_18px_50px_rgba(25,22,92,.08)] sm:p-8">
      <div className="mb-6 flex items-center gap-3"><Image src={logo} alt="FOOTMB" width={56} height={56} className="size-14 rounded-xl object-contain" /><div><p className="font-black italic">FOOT<span className="text-[#ff9d0a]">MB</span></p><p className="text-xs text-muted-foreground">Activation du compte</p></div></div>
      <h1 className="text-2xl font-bold">Choisissez votre mot de passe</h1>
      <p className="mt-2 text-sm text-muted-foreground">Ce lien est personnel et expire après 48 heures.</p>
      <AcceptInviteForm token={token} />
    </div>
  </main>;
}
