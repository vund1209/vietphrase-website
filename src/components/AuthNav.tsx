"use client";

// Login/logout affordance in the header. A client component because it
// needs useSession() -- the root layout that renders it is a server
// component, so this is the one interactive sliver of it.
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

export function AuthNav() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return null;
  }

  if (!session?.user) {
    return (
      <span className="ml-auto flex gap-3">
        <Link href="/login">Đăng nhập</Link>
        <Link href="/signup">Đăng ký</Link>
      </span>
    );
  }

  return (
    <span className="ml-auto flex items-center gap-3">
      <span className="text-neutral-500">{session.user.email}</span>
      <button type="button" onClick={() => signOut({ callbackUrl: "/" })} className="underline">
        Đăng xuất
      </button>
    </span>
  );
}
