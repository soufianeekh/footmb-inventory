import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { canAttemptLogin } from "@/lib/login-limit";
import { findUserByEmail } from "@/lib/users";
import type { UserRole } from "@/lib/users";
import { recordSuccessfulLogin } from "@/lib/activity";
import {
  hasSessionExceededAbsoluteAge,
  resolveSessionStartedAt,
  SESSION_IDLE_MAX_AGE_SECONDS,
} from "@/lib/auth-session";

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: SESSION_IDLE_MAX_AGE_SECONDS, updateAge: 60 * 60 },
  jwt: { maxAge: SESSION_IDLE_MAX_AGE_SECONDS },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Identifiant", type: "text" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials.password === "string" ? credentials.password : "";
        if (!process.env.AUTH_SECRET) return null;
        // Fail closed in production if distributed abuse protection is missing/unreachable.
        if (!(await canAttemptLogin(email))) return null;
        // Verify even when the email is wrong (reduce account enumeration via response timing).
        if (!password || password.length > 512 || !email || email.length > 254) return null;
        const user = await findUserByEmail(email);
        const fallbackHash = "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid";
        const correctPassword = await bcrypt.compare(password, user?.passwordHash || fallbackHash);
        if (!correctPassword || !user?.active) return null;
        await recordSuccessfulLogin(user.id);
        return { id: user.id, name: user.name, email: user.email, role: user.role, storeKeys: user.storeKeys };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.userId = user.id;
        token.storeKeys = user.storeKeys;
        token.sessionStartedAt = Date.now();
      } else if (token.email) {
        const sessionStartedAt = resolveSessionStartedAt(token.sessionStartedAt, token.iat);
        token.sessionStartedAt = sessionStartedAt;
        if (hasSessionExceededAbsoluteAge(sessionStartedAt)) {
          token.role = undefined;
          token.userId = undefined;
          token.email = null;
          token.storeKeys = undefined;
          return token;
        }
        const current = await findUserByEmail(token.email);
        if (current?.active) {
          token.role = current.role;
          token.userId = current.id;
          token.name = current.name;
          token.storeKeys = current.storeKeys;
        } else {
          token.role = undefined;
          token.userId = undefined;
          token.email = null;
          token.storeKeys = undefined;
        }
      }
      return token;
    },
    session({ session, token }) {
      const adminEmail = process.env.FOOTMB_ADMIN_EMAIL?.trim().toLowerCase();
      session.user.role =
        (token.role as UserRole | undefined) ||
        (adminEmail && token.email?.toLowerCase() === adminEmail ? "builder" : "reader");
      session.user.id = typeof token.userId === "string" ? token.userId : String(token.sub || "");
      session.user.storeKeys = Array.isArray(token.storeKeys) ? token.storeKeys.filter((key): key is string => typeof key === "string") : [];
      return session;
    },
  },
});
