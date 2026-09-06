"use client";

// Site-wide header: logo, primary nav (with active-route highlighting, which
// didn't exist before), theme toggle, auth state, and a collapsing mobile
// menu -- the previous header was a single flat flex row with no small-screen
// treatment at all.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { BookOpen, BookBookmark, List, MagnifyingGlass, Translate, X } from "@phosphor-icons/react";
import { AuthNav } from "./AuthNav";
import { ThemeToggle } from "./ThemeToggle";
import { DictionaryStatusDot } from "./DictionaryStatusDot";

const NAV_ITEMS = [
  { href: "/translate", label: "Dịch nhanh", icon: Translate },
  { href: "/search", label: "Tìm truyện", icon: MagnifyingGlass },
  { href: "/surf", label: "Đọc web", icon: BookOpen },
];

// Admin-only: previously had no nav entry at all, so an admin who just
// applied a global dictionary correction (SpanEditor's "Áp dụng cho tất cả
// truyện") had no way to find /admin/dictionary to review/manage it.
const ADMIN_NAV_ITEM = { href: "/admin/dictionary", label: "Từ điển chung", icon: BookBookmark };

export function SiteHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const navItems = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3 text-sm">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight">
          VietPhrase
        </Link>

        <span className="hidden items-center gap-1 md:flex">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon size={16} weight={active ? "fill" : "regular"} />
                {label}
              </Link>
            );
          })}
        </span>

        <span className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <span className="hidden items-center gap-2 md:flex">
            <DictionaryStatusDot />
            <AuthNav />
          </span>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Đóng menu" : "Mở menu"}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
          >
            {mobileOpen ? <X size={20} /> : <List size={20} />}
          </button>
        </span>
      </nav>

      {mobileOpen && (
        <div className="flex flex-col gap-1 border-t border-border px-6 py-3 text-sm md:hidden">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 ${
                  active ? "bg-muted font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon size={18} weight={active ? "fill" : "regular"} />
                {label}
              </Link>
            );
          })}
          <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
            <DictionaryStatusDot />
            <AuthNav />
          </div>
        </div>
      )}
    </header>
  );
}
