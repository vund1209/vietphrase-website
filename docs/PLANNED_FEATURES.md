# Planned features (not yet built)

Captured from a design conversation so the reasoning isn't lost across a
Claude Code usage reset. Nothing here is implemented yet -- treat this as
the starting brief for whoever (human or Claude) picks these up next,
not a changelog.

## 1. A real global/base dictionary override (distinct from per-novel `Name`)

**The gap**: today there are three places a translation can live --
1. The bulk dictionary (`words`/`pronouns`/`hanviet_fallback`/global
   `names` tables) in the bundled, read-only SQLite file
   (`data/seed/dictionary_seed.db`). Never edited at runtime; rebuilt
   from source via `data/seed/build_dictionary.py`.
2. `Name` (Postgres) -- editor/admin corrections, but **scoped to one
   novel** (`novelId` is required, not nullable). In practice this table
   already gets used for general phrase fixes, not just literal proper
   nouns, despite its doc comment framing it as "per-novel proper-noun
   overrides" -- the naming undersells what it's actually used for.
3. `UserWordOverride` (Postgres) -- one reader's private correction, also
   scoped to one novel.

There's no way to fix a translation **once** and have it apply
everywhere. An editor who spots a bad word/phrase translation has to
independently re-promote the same fix in every novel where it comes up,
and there is no path at all for a correction to reach the shared base
dictionary. Confirmed: the base dictionary is SQLite-only, not
duplicated into Postgres (deliberately -- see `docs/ARCHITECTURE.md`
"Data split", the file is ~226 MB, Neon's free tier caps storage at
0.5 GB).

**Proposed design**: a fourth table, `GlobalWordOverride` -- no
`novelId` at all, applies to every novel:

```
model GlobalWordOverride {
  id             Int      @id @default(autoincrement())
  chineseText    String   @unique
  vietnameseText String
  capStyle       NameCapStyle @default(NONE)
  phraseLength   Int
  source         String   // e.g. "admin_edit"
  createdById    Int?
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

This does **not** duplicate the bulk dictionary -- like `Name` and
`UserWordOverride` already prove, a sparse table of admin-curated
corrections stays tiny (starts empty, grows slowly) regardless of how
large the underlying SQLite file is. Same storage-budget reasoning
applies unchanged.

**Wiring**:
- `src/lib/overrides.ts` gains `loadGlobalWordOverrides()`, same
  `{translations, capStyles}` shape as the existing loaders.
- Merge precedence becomes personal > per-novel `Name` > global >
  SQLite base dictionary: `new Map([...global, ...perNovel, ...personal])`
  (later entries win). Every current call site that builds an overrides
  map (`src/lib/novels.ts`'s `getOrTranslateChapter`, the promote
  route's title/description re-translate, `scripts/retranslate-novel.mjs`)
  needs the global layer merged in, not just the per-novel one.
- **UI**: one more action button next to the existing "Thêm vào từ điển
  chung" (which stays per-novel, EDITOR+ADMIN) -- "Áp dụng cho tất cả
  truyện" (apply to every novel), **ADMIN-only** (bigger blast radius
  than a per-novel promote deserves a higher bar). New route
  `POST /api/dictionary/global`, same validation shape as
  `.../overrides/promote/route.ts`.
- New admin page `/admin/dictionary` to browse/search/deactivate
  existing global overrides -- mirrors `/novels/[slug]/overrides` but
  site-wide instead of per-novel.
- Migration: purely additive (one new table), no changes to existing
  ones.

## 2. Manual "re-fetch from source" per chapter

**The gap**: `getOrTranslateChapter` (`src/lib/novels.ts`) only ever
scrapes when `rawText` is `NULL` -- once a chapter has been fetched
once, it is **never** re-fetched, even if the source site later edits
that chapter (typo fix, added a missing paragraph, etc). There's
currently no way to force a re-check.

**Design**:
- `POST /api/novels/[slug]/chapters/[number]/refetch` -- gate to
  ADMIN (or EDITOR+ADMIN; needs a call either way since this makes a
  real outbound HTTP request to the source site and shouldn't be
  spammable by just anyone). Clears `rawText` and resets
  `status: "PENDING"`, `scrapedAt: null` -- the existing lazy-scrape
  path in `getOrTranslateChapter` already does the right thing on the
  next view with zero new scraping code needed. (Re-scraping inline in
  the same request instead of lazily is also fine, just marginally more
  code for no real benefit.)
- Fetches via `chapter.sourceUrl` -- **not** `sourceChapterId`, which is
  only a best-effort parsed reference/dedup field, never used for
  fetching.
- **UI**: a "Tải lại từ nguồn" button on the chapter page, ADMIN-gated,
  with a confirm dialog (re-fetching discards the current `rawText`;
  existing `UserWordOverride`/`Name` rows are unaffected since they're
  keyed by `chineseText`, not by chapter -- a stale one simply stops
  matching if the source text changed rather than corrupting anything).
- Later, not now: a bulk "recheck this whole novel" action, and maybe a
  cooldown/rate-limit per chapter to avoid hammering a source site if
  the button gets clicked repeatedly.

## 3. "Surf" mode -- read + translate an arbitrary Chinese page without embedding it

Modeled on sangtacviet.com's own "Translate Webpage" nav item
(`/surf.php`). Different from add-by-URL: **ephemeral**, no persistent
`Novel`/`Chapter` rows -- fetch one page, extract, translate, display,
done. Useful for skimming a page you don't want to permanently add to
the library.

**Design**:
- New page `/surf` + `POST /api/surf` `{ url }` → fetch the page,
  extract readable text (reuse `extractChapterContent`/
  `fetchChapterContent` from `src/lib/scraper.ts` and
  `src/lib/extract/chapterContent.ts` -- already generic enough for
  this), translate via `translateText` with **no per-novel context**
  (same no-context path the standalone `/translate` page already uses,
  just fed from a fetched URL instead of pasted text).
- **Interactivity question**: there's no `novelId` to scope a
  `UserWordOverride`/`Name` edit to. This is where item #1 above
  becomes the natural save target -- once `GlobalWordOverride` exists,
  an edit made while surfing has somewhere sensible to land (there's
  nowhere else it *could* go, structurally). Until then, ship Surf mode
  as **read-only** (same flat-text rendering anonymous chapter views
  already get), and revisit adding the interactive editor once #1 is in
  place.

## Suggested build order

1. **Global dictionary overrides** (#1) -- independently valuable right
   now (fixes the "have to repeat every correction per-novel" problem),
   and unblocks a sane edit target for #3.
2. **Manual re-fetch** (#2) -- small, fully isolated, no dependencies on
   the other two.
3. **Surf mode** (#3) -- benefits from #1 existing first if the
   interactive editor is wanted, but the read-only version doesn't
   strictly need to wait.

None of this is built yet -- come back to each with the same
plan-first-then-verify-live-in-the-browser workflow used for every
other feature this project has shipped so far.
