"use server";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { safeCallbackPath } from "@/lib/auth-session";

export async function loginAction(_state: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const redirectTo = safeCallbackPath(String(form.get("callbackUrl") ?? "/"));
  try {
    await signIn("credentials", { email, password, redirectTo });
    return null;
  } catch (error) {
    if (error instanceof AuthError) return "Identifiant ou mot de passe incorrect. Réessayez.";
    throw error; // Preserve NEXT_REDIRECT behavior
  }
}
