"use client";

// Thin client wrapper so the root layout (a server component) can still
// give every page access to next-auth/react's useSession()/signIn()/
// signOut() hooks -- SessionProvider itself must run on the client.
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
