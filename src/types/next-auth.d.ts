// Module augmentation for next-auth (Auth.js v5): adds `id` and `role`
// to the session/JWT shapes so route handlers and pages can read
// `session.user.role` without casting everywhere. See
// docs/ARCHITECTURE.md "User management and per-word overrides".
//
// Deliberately a local string-literal union rather than importing
// Prisma's generated UserRole enum: this file needs to typecheck even
// before `npx prisma generate` has been re-run to pick up the new User
// model (see README "Next up"), and the two stay structurally
// compatible (Prisma's enum values are these same strings at runtime).
import type { DefaultSession } from "next-auth";

type AppUserRole = "READER" | "EDITOR";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppUserRole;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: AppUserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: AppUserRole;
  }
}
