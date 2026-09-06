// Auth.js (NextAuth v5) config: email + password only (Credentials
// provider), JWT sessions. See docs/ARCHITECTURE.md "User management
// and per-word overrides" for why credentials-only (small, trusted-
// editor product, not a public sign-up funnel -- no OAuth app to
// register or maintain) and why JWT sessions (the Credentials provider
// doesn't support Auth.js's database-session strategy; JWT needs no
// Session table in Postgres at all).
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Tighter than Surf/Browse's limit (see src/lib/rateLimit.ts) -- a login
// attempt is exactly the brute-force-guessing surface that benefits most
// from a strict cap. See the planning doc's section 11.
const LOGIN_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 10 };

type AppUserRole = "READER" | "EDITOR" | "ADMIN";

function coerceRole(role: unknown): AppUserRole {
  return role === "ADMIN" || role === "EDITOR" ? role : "READER";
}

// ADMIN is a superset of EDITOR for shared-dictionary promotion rights;
// only ADMIN can delete a novel. See prisma/schema.prisma's UserRole enum.
export function isEditorOrAdmin(role: unknown): boolean {
  return role === "EDITOR" || role === "ADMIN";
}

export function isAdmin(role: unknown): boolean {
  return role === "ADMIN";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const rateLimit = await checkRateLimit("login", getClientIp(request), LOGIN_RATE_LIMIT);
        if (!rateLimit.allowed) return null;

        const email =
          typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: String(user.id), email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    // Deliberately coerce rather than rely on structural inference here:
    // `user` is whatever authorize() above returned, and its precise
    // static type is a moving target across next-auth versions/adapter
    // configurations for a Credentials-only, JWT-only setup like this
    // one -- these two lines are the one place that needs to be right
    // regardless, so they're written defensively instead.
    jwt({ token, user }) {
      if (user) {
        token.id = String(user.id);
        token.role = coerceRole(user.role);
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : "";
        session.user.role = coerceRole(token.role);
      }
      return session;
    },
  },
});
