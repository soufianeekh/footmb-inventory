import NextAuth from "next-auth";
import type { UserRole } from "@/lib/permissions";
import {
  hasSessionExceededAbsoluteAge,
  resolveSessionStartedAt,
  SESSION_IDLE_MAX_AGE_SECONDS,
} from "@/lib/auth-session";

// Keep the proxy bundle edge-safe. Authentication providers and database-backed
// callbacks live in auth.ts and run only in the Node.js server runtime.
export const { auth: edgeAuth } = NextAuth({
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: SESSION_IDLE_MAX_AGE_SECONDS, updateAge: 60 * 60 },
  jwt: { maxAge: SESSION_IDLE_MAX_AGE_SECONDS },
  providers: [],
  callbacks: {
    jwt({ token }) {
      if (token.email) {
        const sessionStartedAt = resolveSessionStartedAt(token.sessionStartedAt, token.iat);
        token.sessionStartedAt = sessionStartedAt;
        if (hasSessionExceededAbsoluteAge(sessionStartedAt)) {
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
      session.user.storeKeys = Array.isArray(token.storeKeys)
        ? token.storeKeys.filter((key): key is string => typeof key === "string")
        : [];
      return session;
    },
  },
});
