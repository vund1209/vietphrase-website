"use client";

// Mounted once in the root layout: keeps this browser's IndexedDB copy
// of personal overrides + reading progress (see src/lib/clientSync.ts)
// in sync with the signed-in account, and offers to import whatever was
// saved anonymously before login. See the planning doc's sections 3-4.
//
// Rule (deliberately only reacts to a *defined* session user id):
// whenever the signed-in user id doesn't match IndexedDB's
// `meta.syncedUserId`, wipe the local store and repopulate it from
// Postgres for that account, then offer to import any pre-existing local
// entries not already covered server-side. Signing out (no session user)
// does nothing -- it neither wipes nor re-syncs -- so this only ever
// triggers on an actual account change on a shared browser, which is the
// scenario that actually needs isolation.
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  getClientMeta,
  setClientMeta,
  getAllPersonalOverrides,
  clearPersonalOverrides,
  putPersonalOverride,
  getAllReadingProgress,
  clearReadingProgressLocal,
  putReadingProgressLocal,
  type PersonalOverrideRecord,
  type ReadingProgressRecord,
} from "@/lib/clientSync";

interface ImportOffer {
  overrides: PersonalOverrideRecord[];
  progress: ReadingProgressRecord[];
}

async function fetchServerState(): Promise<{
  overrides: PersonalOverrideRecord[];
  progress: ReadingProgressRecord[];
}> {
  const [overridesRes, progressRes] = await Promise.all([
    fetch("/api/user/overrides"),
    fetch("/api/user/reading-progress"),
  ]);
  const overridesData: { overrides?: PersonalOverrideRecord[] } = await overridesRes
    .json()
    .catch(() => ({}));
  const progressData: { progress?: ReadingProgressRecord[] } = await progressRes
    .json()
    .catch(() => ({}));
  return { overrides: overridesData.overrides ?? [], progress: progressData.progress ?? [] };
}

async function writeServerStateLocally(overrides: PersonalOverrideRecord[], progress: ReadingProgressRecord[]) {
  await Promise.all([
    ...overrides.map((o) => putPersonalOverride(o)),
    ...progress.map((p) => putReadingProgressLocal(p.novelSlug, p.novelTitle, p.chapterNumber)),
  ]);
}

export function ClientSyncBoundary() {
  const { data: session, status } = useSession();
  const [offer, setOffer] = useState<ImportOffer | null>(null);
  const [importing, setImporting] = useState(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (status === "loading") return;
    const userId = session?.user?.id ? Number(session.user.id) : null;
    if (userId === null || syncingRef.current) return;

    let cancelled = false;
    (async () => {
      const meta = await getClientMeta();
      if (meta.syncedUserId === userId) return; // already synced for this account

      syncingRef.current = true;
      try {
        // Capture whatever's here before wiping -- candidates for the
        // import offer below (anonymous entries, or a stale different
        // account's if this browser was shared).
        const [priorOverrides, priorProgress] = await Promise.all([
          getAllPersonalOverrides(),
          getAllReadingProgress(),
        ]);

        await Promise.all([clearPersonalOverrides(), clearReadingProgressLocal()]);

        const server = await fetchServerState();
        if (cancelled) return;
        await writeServerStateLocally(server.overrides, server.progress);
        await setClientMeta({ syncedUserId: userId, lastSyncedAt: new Date().toISOString() });

        const serverOverrideKeys = new Set(
          server.overrides.map((o) => `${o.novelSlug}:${o.chineseText}`)
        );
        const newOverrides = priorOverrides.filter(
          (o) => !serverOverrideKeys.has(`${o.novelSlug}:${o.chineseText}`)
        );

        // Reading progress has an obvious, low-risk merge rule word
        // overrides don't: keep whichever chapter number is further
        // along, per novel.
        const serverChapterBySlug = new Map(server.progress.map((p) => [p.novelSlug, p.chapterNumber]));
        const newProgress = priorProgress.filter((p) => {
          const serverChapter = serverChapterBySlug.get(p.novelSlug);
          return serverChapter === undefined || p.chapterNumber > serverChapter;
        });

        if (newOverrides.length > 0 || newProgress.length > 0) {
          setOffer({ overrides: newOverrides, progress: newProgress });
        }
      } finally {
        syncingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id]);

  async function acceptImport() {
    if (!offer) return;
    setImporting(true);
    await Promise.all([
      ...offer.overrides.map((o) =>
        fetch(`/api/novels/${o.novelSlug}/overrides`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chineseText: o.chineseText,
            vietnameseText: o.vietnameseText,
            capStyle: o.capStyle,
            track: o.track,
          }),
        }).catch(() => null)
      ),
      ...offer.progress.map((p) =>
        fetch(`/api/novels/${p.novelSlug}/progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterNumber: p.chapterNumber }),
        }).catch(() => null)
      ),
    ]);
    // Re-sync from server so IndexedDB reflects exactly what's durable now.
    const server = await fetchServerState();
    await writeServerStateLocally(server.overrides, server.progress);
    setImporting(false);
    setOffer(null);
  }

  if (!offer) return null;

  const count = offer.overrides.length + offer.progress.length;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-lg">
        <span>Bạn có {count} mục lưu khi chưa đăng nhập — nhập vào tài khoản?</span>
        <button
          type="button"
          onClick={acceptImport}
          disabled={importing}
          className="cursor-pointer rounded-md bg-secondary px-3 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-900"
        >
          {importing ? "Đang nhập…" : "Nhập vào tài khoản"}
        </button>
        <button
          type="button"
          onClick={() => setOffer(null)}
          className="cursor-pointer rounded-md border border-border px-3 py-1.5 hover:bg-muted"
        >
          Bỏ qua
        </button>
      </div>
    </div>
  );
}
