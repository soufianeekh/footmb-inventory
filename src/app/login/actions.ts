"use server";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export async function loginAction(_state: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const target = String(form.get("callbackUrl") ?? "/");
  // Only allow an internal relative path for redirects.
  const redirectTo = /^\/(?:inventory(?:\/\d+)?|stats|settings)?$/.test(target) ? target : "/";
  try {
    await signIn("credentials", { email, password, redirectTo });
    return null;
  } catch (error) {
    if (error instanceof AuthError) return "Identifiant ou mot de passe incorrect. Réessayez.";
    throw error; // Preserve NEXT_REDIRECT behavior
  }
}
