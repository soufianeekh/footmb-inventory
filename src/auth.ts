import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { canAttemptLogin } from "@/lib/login-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Identifiant", type: "text" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials.password === "string" ? credentials.password : "";
        const allowedEmail = process.env.FOOTMB_ADMIN_EMAIL?.trim().toLowerCase();
        const hashB64 = process.env.FOOTMB_ADMIN_PASSWORD_HASH_B64;
        const passwordHash = hashB64 ? Buffer.from(hashB64, "base64url").toString("utf8") : "";
        if (!allowedEmail || !passwordHash || !process.env.AUTH_SECRET) return null;
        // Fail closed in production if distributed abuse protection is missing/unreachable.
        if (!(await canAttemptLogin())) return null;
        // Verify even when the email is wrong (reduce account enumeration via response timing).
        if (!password || password.length > 512 || !email || email.length > 254) return null;
        const correctPassword = await bcrypt.compare(password, passwordHash);
        if (!correctPassword || email !== allowedEmail) return null;
        return { id: "footmb-admin", name: "FOOTMB Admin", email: allowedEmail };
      },
    }),
  ],
});
