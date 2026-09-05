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
      <span className="flex items-center gap-3">
        <Link href="/login" className="text-muted-foreground hover:text-foreground">
          Đăng nhập
        </Link>
        <Link
          href="/signup"
          className="rounded-md bg-secondary px-3 py-1.5 text-white hover:opacity-90 dark:text-neutral-900"
        >
          Đăng ký
        </Link>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-3">
      <span className="hidden text-muted-foreground md:inline">{session.user.email}</span>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="cursor-pointer text-muted-foreground underline hover:text-foreground"
      >
        Đăng xuất
      </button>
    </span>
  );
}
