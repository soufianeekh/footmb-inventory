import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
export const instant = false;

export default async function SecureLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }
  return (
    <AppShell user={{
      id: session.user.id,
      name: session.user.name || session.user.email,
      email: session.user.email,
      role: session.user.role,
    }}>{children}</AppShell>
  );
}
