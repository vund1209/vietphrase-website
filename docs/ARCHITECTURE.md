# Product architecture

This is the resolved shape of the application, written down once the
three originally-separate-sounding features turned out to converge on one
pipeline — capturing that now so it doesn't get re-litigated or forgotten
before the app is scaffolded. `docs/VIETPHRASE_CORE.md` covers the
translation engine itself; this doc covers everything around it: what the
site does, how content gets in, and how it's stored.

**Reference implementation: sangtacviet.com.** The product being built is
explicitly modeled on this real, existing site — a Vietnamese reader for
Chinese web novels using VietPhrase-style translation. When a design
question here is ambiguous, "what would sangtacviet do" is a legitimate
tiebreaker, and concrete samples from it (like the translate-endpoint
contract below) should be treated as informed precedent, not just
inspiration.

**Status (2026-09-05): the translate page is scaffolded and working.** The
Next.js app now exists (`src/app/`), and `POST /api/translate` calls
`packages/tokenizer` directly against `data/seed/dictionary_seed.db` --
verified end to end to reproduce the real sangtacviet.com sample below
exactly. The reading library (surfaces 1/2) and the Postgres/Prisma
backend are still design-only; see "Data access: avoid per-lookup DB
round-trips" below for a correction that must land before the tokenizer
is pointed at Postgres.

## The three surfaces, and why they're really one pipeline

The product was described as three features:

1. **The reading library** — paste a book's URL from a Chinese novel
   site, the system adds the book, loads its chapter list, and clicking a
   chapter shows the VietPhrase-translated text.
2. **"Live scrape, live translate" / "surfing"** — browsing translated
   chapters live, on the fly.
3. **A translate page** — paste Chinese text in a box, get VietPhrase
   output in another box.

(1) and (2) turned out to be the same feature with two entry points, not
two systems. Whether someone starts by pasting a book's homepage/table-
of-contents URL, or by pasting a single chapter URL they found while
"surfing" a Chinese site, the result is identical: the system extracts
chapter text, translates it, caches it, and shows it in **our own reading
UI** — not the source site's page, layout, or navigation. A single
chapter URL, if the book behind it isn't in our system yet, triggers
auto-discovery of the parent book (see "Open problem: book discovery"
below) so it becomes a real library entry, not a one-off. There is no
separate proxy/mirroring system, and — explicitly ruled out — no full-page
HTML proxy that preserves the source site's own layout/navigation with
just the prose swapped. That would need rewriting every link and asset
URL, breaks on JS-heavy sites, and carries meaningfully more legal/ToS
exposure than extracting and re-hosting text, which is what this is.

(3) is the odd one out, and stays simple: no scraping, no persistence —
just `packages/tokenizer` run directly against whatever text the user
pastes. See "Translate page: API design" below for the concrete contract.

```
[Add book by URL]  ──┐
                      ├──> extraction (see below) ──> scrape_blacklist filter
[Paste chapter URL] ──┘            │                          │
   ("surfing")                     │                          v
                                    │              VietPhraseTokenizer.tokenize()
                                    v                          │
                         Novel + Chapter rows  <───────────────┘
                         (cached raw + translated text)
                                    │
                                    v
                       our reading UI (book page, chapter list,
                       chapter reader — never the source site's UI)

[Translate page] ──> VietPhraseTokenizer.tokenize(pasted text) directly
                      (no scraping, no persistence)
```

## Scraping strategy: generic extraction, adapters as a fallback

Chinese novel sites vary too much to hand-write a parser per site up
front, and there's no fixed list of target sites yet. Start with a
generic heuristic extractor that works reasonably across most sites
without site-specific code, and add a dedicated per-site adapter only
where the generic approach demonstrably fails on a site that's actually
being used. Two extraction problems, both heuristic, both needing real
target sites to tune against (see "Open problem" below — this is
designed, not yet validated against real pages):

- **Chapter list extraction** (given a book/table-of-contents page): find
  the container with the densest cluster of same-pattern links whose
  anchor text looks chapter-like (matches chapter-label patterns already
  identified in `docs/DICTIONARY_SOURCES.md`'s grammar-rules work — 章/回/
  卷/节/節/集, or sequential numbering), in DOM order.
- **Chapter content extraction** (given a single chapter page): find the
  text block with the highest density of Chinese characters relative to
  markup/link density (the same class of heuristic as Mozilla's
  Readability), then run it through `scrape_blacklist` to strip ads and
  "to be continued"-style junk before it ever reaches the tokenizer.

Per-site adapters, when needed, implement a common interface
(`matches(url)`, `getBookMetadata(url)`, `getChapterList(url)`,
`getChapterContent(url)`) and are tried before falling back to the
generic extractor. Confirmed with the user this is the expected shape of
things long-term, not just a stopgap: new Chinese novel sites get added
by writing a new adapter for that site's specific pattern as it comes up,
same as sangtacviet.com and similar tools have historically done —
support grows one site at a time, the generic extractor is there to give
new/unsupported sites a reasonable shot rather than failing outright.

## Scrape timing: lazy, on first view — no job queue for v1

When a book is added, only the chapter **list** is fetched immediately
(fast — it's one page). Each chapter's actual content is scraped,
filtered, translated, and cached **the first time someone views it**;
every view after that is served from the cache instantly. This was
chosen deliberately over eagerly scraping and translating every chapter
in the background the moment a book is added, because lazy-on-view needs
no background job queue or worker infrastructure at all for v1 — it's a
normal request with a brief loading state on first view only. An eager
"pre-fetch this whole book" option can be added later as a real
background job once there's a reason to want one; nothing in this design
blocks that.

## Data model

`prisma/schema.prisma`'s `Novel` model — originally built for per-novel
name-override scoping (see `docs/DICTIONARY_SOURCES.md` "Schema v3") — is
already the right entity for "Book." It needs new fields (`author`,
`sourceUrl`, `coverImageUrl`, a status enum) and one new sibling model:

```
model Chapter {
  id             Int      @id @default(autoincrement())
  novelId        Int
  novel          Novel    @relation(fields: [novelId], references: [id], onDelete: Cascade)
  chapterNumber  Int
  title          String
  sourceUrl      String
  rawText        String?  // Chinese, null until first scraped
  translatedText String?  // Vietnamese, null until first translated
  status         ChapterStatus @default(PENDING)
  scrapedAt      DateTime?
  translatedAt   DateTime?
  createdAt      DateTime @default(now())

  @@unique([novelId, chapterNumber])
  @@index([novelId])
}

enum ChapterStatus {
  PENDING     // known from the chapter list, not yet scraped
  SCRAPED     // raw text fetched, not yet translated
  TRANSLATED  // ready to read
  ERROR       // scrape or translation failed
}

enum NovelStatus {
  PENDING   // chapter list not yet fetched
  READY     // chapter list fetched, chapters lazily fill in as viewed
  ERROR
}
```

Applied to `prisma/schema.prisma` as of the commit immediately following
this doc's initial version — the snippet above is kept here for context,
but the actual schema file is the source of truth if the two ever drift.

## Translate page: API design

sangtacviet.com's own translate-box UI calls a plain AJAX endpoint —
captured directly from the real site, useful as concrete precedent for
ours:

```
POST /index.php?ngmar=trans&langhint=chinese HTTP/1.1
Content-type: application/x-www-form-urlencoded

ajax=trans&content=<percent-encoded Chinese text>
```

Response body is just the translated text, plain, no JSON wrapper:

```
Tại hạ chỉ muốn cướp đi các vị đại bảo kiếm
```

(for input `在下只想夺走各位的大宝剑`)

Our equivalent should be a single small API route, e.g. `POST /api/translate`
with a JSON body (`{ "content": "..." }`) rather than form-encoding — no
real reason to match their wire format exactly, only the *shape* of the
interaction (one text in, one call, translated text back, no persistence,
no auth needed). Where this should deliberately go further than
sangtacviet's plain-text response: `packages/tokenizer`'s `tokenize()`
already returns structured tokens (source table, matched span, chosen
translation, raw alternatives), not just a joined string. The API should
return that structured array, not a flattened string, even though the v1
UI probably just joins it for display — the token boundaries are what a
later "click a phrase to see alternatives / edit the dictionary" feature
would need, and it's free to keep them now versus expensive to
reconstruct later. `langhint=chinese` in their URL hints their endpoint
may be multi-language; ours doesn't need that param at all since this
whole project is Chinese-to-Vietnamese only.

## Data split: bulk dictionary stays in SQLite; Postgres holds live app state only

**Revised 2026-09-05, after the first real Neon connection made the
storage math concrete.** `prisma/schema.prisma` originally mirrored the
entire seed dictionary (`Word`/`Pronoun`/`HanvietFallback`/
`ScrapeBlacklistPattern`, plus a "global" sentinel `Novel` row so `Name`
could represent both global and per-novel entries) into Postgres. Checked
against the actual seed file: `data/seed/dictionary_seed.db` is ~226 MB,
`words` alone ~132 MB across 1.43M rows, `names` ~30 MB across 276k rows.
Neon's free tier caps total storage at 0.5 GB. Importing the bulk tables
wholesale would burn most or all of that budget before a single chapter
of real novel content gets stored -- not a viable design for a
free-tier-hosted app, and it's also duplicating data that never changes
at runtime (`words`/`pronouns`/`hanviet_fallback`/`scrape_blacklist` are
rebuilt from source, never edited row-by-row through the app -- see
`docs/DICTIONARY_SOURCES.md`).

**Current design:** those four bulk tables stay exactly where they are --
`data/seed/dictionary_seed.db`, shipped read-only alongside the deployed
app, read directly by `packages/tokenizer` via `node:sqlite` (same as
today). Postgres only models what's actually live and mutable: `Novel`,
`Chapter`, and per-novel `Name` overrides. This also means the "global"
sentinel-row trick is gone from `prisma/schema.prisma` entirely -- every
`Name` row in Postgres now has a required `novelId`, since the global/
fallback name tier lives in the SQLite seed's own `names` table (which
keeps its existing nullable-`novel_id` / partial-unique-index design,
unchanged -- that schema was never the problem, only mirroring it into
Postgres was).

**What this means for the tokenizer, and the per-lookup round-trip
concern that used to be documented here:** since the bulk dictionary
never moves to Postgres, `packages/tokenizer`'s existing per-substring
SQLite queries stay exactly as they are -- fine, because that's a local
file with no network hop. The only Postgres-backed layer is per-novel
`Name` overrides, and those don't need a query per candidate substring
either: fetch every override row for the current `novelId` in **one**
query at the start of translating a chapter (there are at most a few
hundred per novel, realistically far fewer), build a small in-memory Map
from it, and check that Map first at each tokenizer position before
falling through to SQLite's global `names`/`pronouns`/`words`. One
Postgres round-trip per chapter translation, not per substring -- this is
the shape `packages/tokenizer` needs to grow into (an optional
`overrides` map parameter to `tokenize()`), not yet implemented. See
`docs/VIETPHRASE_CORE.md` "Per-novel name resolution" for how this
changes the lookup priority order.

## Hosting: cloud Postgres free tier — Neon

Decided: **Neon**, over Supabase, for v1. Both are Prisma-compatible
free-tier options; Neon fits this project better on two points that
matter here specifically:

- **Idle behavior.** Neon's free compute autosuspends after 5 minutes of
  inactivity and transparently resumes on the next query (a few hundred
  ms of cold-start latency, no action needed). Supabase instead **pauses
  the whole project after 1 week of inactivity**, and someone has to
  manually unpause it from the dashboard before it responds again -- a
  real annoyance for a project with irregular dev/usage activity, and
  restorable for only up to a year before the data is gone for good.
- **Scope.** This project only needs Postgres + Prisma. Neon is a
  focused Postgres product; Supabase bundles Auth, Storage, Realtime, and
  Edge Functions that this app has no plans to use, which is unnecessary
  surface area for a project that's trying to stay clean and minimal.

Free tier limits worth knowing: 0.5 GB storage, ~100 compute-hours/month,
up to 100 projects / 10 branches each, built-in connection pooler, 5 GB
egress/month (checked 2026-09; verify against neon.tech/pricing if this
gets stale). Prisma needs **two** connection strings against Neon: a
pooled `DATABASE_URL` (host has `-pooler` in it) for the running app, and
a direct/unpooled `DIRECT_URL` for `prisma migrate` — both are declared
in `prisma/schema.prisma`'s `datasource` block and documented with
examples in the root `.env.example`. The real values go in a local `.env`
(never committed).

## Open problem: discovering the parent book from a single chapter URL

If someone pastes a single chapter URL for a book that isn't in the
system yet (the "surfing" entry point), the system needs to find the
book's full chapter list, not just translate that one page. Real sites
usually link back to a table-of-contents page from a chapter page (a
"目录" / "章节目录" / "directory" link), or use a predictable URL
structure (`/book/123/456.html` where `/book/123/` is the TOC) — but
which of these applies is site-specific and unvalidated. Not solved yet;
needs real target site examples to design against properly, not
guesswork. If no parent book can be found, the fallback is presumably to
translate just that one chapter as an orphaned entry — acceptable, but
not designed in detail yet.

## What's deliberately out of scope for v1

- No background job queue/worker (see "Scrape timing" above).
- No full-page HTML proxy/mirroring (see "The three surfaces" above).
- No per-site adapters until the generic extractor demonstrably fails on
  a site actually being used.
- No specific target sites chosen yet — the generic extraction approach
  is designed against general knowledge of how these sites tend to be
  structured, not tested against real pages. Needs 2-3 real example URLs
  to validate against before this is trusted.
