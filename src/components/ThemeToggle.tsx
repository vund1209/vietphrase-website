"use client";

// Manual light/dark override, on top of the OS-preference default (see the
// inline init script in src/app/layout.tsx's <head>, which sets the `.dark`
// class before paint to avoid a flash of the wrong theme on load).
import { useEffect, useState } from "react";
import { Moon, Sun } from "@phosphor-icons/react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    // One-time read of the `.dark` class the inline init script (see
    // layout.tsx) already set before this ever mounts -- not state that
    // changes elsewhere and needs a subscription, just an SSR/client split
    // (server has no DOM class to read at all) resolved after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
  }

  // Avoid a server/client mismatch flash: render nothing until mounted, since
  // the real state lives in a class the init script sets client-side only.
  if (isDark === null) {
    return <span className="inline-block h-9 w-9" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
    >
      {isDark ? <Sun size={20} weight="bold" /> : <Moon size={20} weight="bold" />}
    </button>
  );
}
