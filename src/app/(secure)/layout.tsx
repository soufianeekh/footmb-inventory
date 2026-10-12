import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
export const instant = false;

export default async function SecureLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const allowed = process.env.FOOTMB_ADMIN_EMAIL?.trim().toLowerCase();
  if (!allowed || session?.user?.email?.toLowerCase() !== allowed) {
    redirect("/login");
  }
  return <AppShell>{children}</AppShell>;
}
