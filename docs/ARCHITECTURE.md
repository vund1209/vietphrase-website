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

**Implementation status (2026-09-05): built, unit-tested, structurally
validated against two real sites, still not verified end-to-end against
the live Neon database.** The generic extractors
(`src/lib/extract/chapterList.ts`, `chapterContent.ts`), the scraper
entry points (`src/lib/scraper.ts`), the Novel/Chapter API routes
(`src/app/api/novels/...`), and the reading UI (home page's add-by-URL
form + library list, `/novels/[slug]`, `/novels/[slug]/chapters/
[number]`) all exist and pass `npm test` (synthetic HTML fixtures, 26
tests) plus a synthetic-site dev-server smoke test (fake local HTTP
server standing in for a Chinese novel site). Prisma Client, as
generated on the real Windows machine, had no Linux query engine
binary, so every Postgres-touching route 500'd when run through the
bridged Linux dev environment; fixed by adding
`binaryTargets = ["native", "debian-openssl-3.0.x"]` to
`prisma/schema.prisma`'s generator block and regenerating on the real
machine.

Research against two real, structurally different sites --
book.sfacg.com (the Chinese source behind the sangtacviet.com mirror the
user pointed at) and 69shuba.com -- surfaced two real-world patterns the
generic extractors didn't originally handle, both now fixed:

- **Two-hop book pages.** Neither site's natural "paste this book URL"
  landing page contains the chapter list -- it links to a separate TOC
  page one hop away (sfacg: `/Novel/<id>/MainIndex/` via a "点击阅读"
  link; 69shuba: `/book/<id>/` via a "开始阅读" link from
  `/book/<id>.htm`), and neither link's text reliably contains an
  obvious "目录" keyword. `fetchChapterList()` in `src/lib/scraper.ts`
  now falls back to `findTocLink()`: if the given URL yields zero
  chapters, it follows the first same-origin link matching a broader set
  of TOC-like href/text signals and retries extraction there once (one
  hop only, to avoid loops).
- **`<br>`-separated content, no `<p>` tags at all.** sfacg.com uses
  clean `<p>`-per-paragraph markup, but 69shuba.com's chapter body
  (`DIV.txtnav`) separates paragraphs with `<br>` and has zero `<p>`
  children -- `.text()` alone ignores `<br>` and would collapse every
  paragraph into one unbroken blob. `extractParagraphs()` in
  `src/lib/extract/chapterContent.ts` now falls back to converting
  `<br>` elements to newlines before reading text when a winning
  container has no `<p>` children.
- The densest-cluster chapter-list algorithm itself needed no changes:
  it correctly found book.sfacg.com's 1207 real chapters (effectively
  immediate `<li>` wrapping) and 69shuba.com's 569 real chapters
  (requiring the ancestor-depth-2 escalation the algorithm already had)
  once pointed at each site's real TOC page.

What's still unverified: a true live end-to-end pass (add a real book,
scrape a real chapter, confirm the row lands in Neon) has not been run,
against either the synthetic fixture or the two real sites. The bridged
Linux dev environment this assistant runs in cannot reach Neon's
Postgres endpoint at all -- direct connections are blocked by the same
network-egress allowlist that blocks fetching book.sfacg.com/69shuba.com
pages directly (confirmed: the sandbox's HTTP CONNECT proxy returns `403
blocked-by-allowlist` for the Neon host, same as it does for those
sites) -- so this needs to be run on the real Windows machine directly,
outside the bridge, or from an environment whose egress allowlist
includes the Neon host.

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
(fast — it's one page). Each chapter's actual Chinese content is
scraped and cached **the first time someone views it** (`rawText`);
every view after that reuses the cached raw text with no re-scrape.
This was chosen deliberately over eagerly scraping every chapter in the
background the moment a book is added, because lazy-on-view needs no
background job queue or worker infrastructure at all for v1 — it's a
normal request with a brief loading state on first view only. An eager
"pre-fetch this whole book" option can be added later as a real
background job once there's a reason to want one; nothing in this design
blocks that.

**Revised 2026-09-06**: only the raw Chinese text is cached — VietPhrase
translation is a render-time layer applied to `rawText` on *every* view,
not a separately cached column (see "Read-path layering" below). This is
the actual VietPhrase-tool model (confirmed against the reference
VietPhrase Analyzer tool), and it means a dictionary change takes effect
on the very next view with no invalidation step at all.

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
book's full chapter list, not just translate that one page. This is
distinct from (but related to) the two-hop book-landing-page pattern
found on book.sfacg.com/69shuba.com and already handled by
`findTocLink()` (see "Scraping strategy" above) -- that fallback starts
from a book/landing URL that lacks a chapter list, not from an arbitrary
single chapter URL. Real sites usually link back to a table-of-contents
page from a chapter page too (a "目录" / "章节目录" / "directory" link,
or the same broader signal set `findTocLink()` already checks for), or
use a predictable URL structure (`/book/123/456.html` where `/book/123/`
is the TOC) — but `findTocLink()` is not yet wired up for this
single-chapter-URL entry point specifically, only for the add-a-book
flow. Extending it there is likely straightforward given the same
mechanism already exists, but unconfirmed against a real "paste a bare
chapter URL" case. If no parent book can be found, the fallback is
presumably to translate just that one chapter as an orphaned entry —
acceptable, but not designed in detail yet.

## User management and per-word overrides

**Implementation status (2026-09-05): schema migrated and Prisma Client
regenerated on the real machine; typechecks clean end to end.** Word-
level Hán-Việt reading tooltips (see below) were added the same day,
after the project owner reviewed sangtacviet.com's reader and asked for
that specific feature. Still not verified against a real live chapter
view end to end -- same Neon-egress-allowlist limitation documented in
"Scraping strategy" applies here too (this assistant's bridged dev
environment can't reach Neon directly), so the actual signed-in reading
flow (sign up, click a word, save, see it reflected; promote as an
editor) needs a manual pass on the real machine.

**Why this exists:** researching sangtacviet.com (the reference site)
turned up a feature this project didn't have yet -- every translated
word/phrase is individually clickable, letting a reader fix a bad
VietPhrase substitution inline rather than living with it for the whole
chapter. That's valuable (it's exactly how a shared dictionary like
`Name` actually improves over time), but exposing *editing* to every
reader directly against the shared `Name` table would mean anyone could
vandalize what every other reader of that novel sees, with no way to
tell whose edit is whose. The fix is to give every override an owner:

- **`User`** -- email + bcrypt password only (Auth.js v5 Credentials
  provider, JWT sessions, no OAuth app to register/maintain -- this is a
  small, trusted-editor product, not a public sign-up funnel). Two
  roles: `READER` (default) and `EDITOR`. No self-service role upgrade;
  an existing EDITOR (or direct DB access) has to grant it.
- **`UserWordOverride`** -- a reader's *private* correction for one
  Chinese phrase in one novel. Visible only to that reader, ever, unless
  promoted (see below). This is the table the interactive reader writes
  to when someone clicks a word and saves a fix.
- **`Name`** (existing, unchanged shape) stays the shared, editor-
  curated dictionary every reader of a novel sees -- now with an added
  nullable `promotedByUserId` for a lightweight audit trail of who
  promoted what.

**Read-path layering** (revised 2026-09-06 -- see `src/lib/overrides.ts` /
`src/lib/novels.ts`): there is no cached translated column at all
anymore. Every view re-tokenizes `Chapter.rawText` fresh: an anonymous
reader gets a flat string (`translateText`, the shared `Name` dictionary
only), a signed-in reader gets the interactive per-token breakdown
(`tokenizeLines`, the shared `Name` dictionary with their own
`UserWordOverride` rows layered on top -- personal always wins on
conflict, never affects what anyone else sees). This re-tokenize is
cheap -- an in-memory SQLite pass over text already in hand, not a
re-scrape -- so there's no meaningful cost difference between the two
paths anymore, and nothing to invalidate when an editor **promotes** an
override into `Name`: the very next view of any chapter simply renders
against the updated dictionary.

**Promotion** (`POST /api/novels/[slug]/overrides/promote`, EDITOR role
required, re-checked server-side regardless of what the UI shows) takes
a chineseText/vietnameseText pair directly rather than a specific
`UserWordOverride` id -- an editor can review any reader's suggestion
(surfaced today via each reader's own `/novels/[slug]/overrides` page)
or type their own correction, and promote whichever value they judge
best.

**Interactive reader** (`src/components/ChapterReader.tsx`): each
translated token renders as its own clickable `<span>`, wrapped with a
hover tooltip showing the Chinese source and its Hán-Việt reading (see
`docs/VIETPHRASE_CORE.md` "Han-Viet reading, alongside (not instead of)
the phrase translation" for how `Token.hanViet` is computed -- this was
explicitly requested after the sangtacviet.com research below, reversing
this doc's earlier "deliberately out of scope" call on it). Clicking a
token opens an inline editor showing both the Chinese and the Hán-Việt
reading alongside the current translation, so a reader can use the
literal reading as a reference when writing a better one; saving posts
to `/api/novels/[slug]/overrides` and optimistically updates every
instance of that exact Chinese phrase in the currently-rendered chapter.
Modeled on sangtacviet.com's per-word `<i>`-wrapped tokens (see the
read-mechanic research that motivated this), minus their text-to-speech
layer -- still deliberately out of scope (see below); the project owner
doesn't want audio/voice features.

## What's deliberately out of scope for v1



- No background job queue/worker (see "Scrape timing" above).
- No full-page HTML proxy/mirroring (see "The three surfaces" above).
- No per-site adapters until the generic extractor demonstrably fails on
  a site actually being used.
- No specific target sites chosen yet — the generic extraction approach
  is designed against general knowledge of how these sites tend to be
  structured, not tested against real pages. Needs 2-3 real example URLs
  to validate against before this is trusted.
- No text-to-speech (sangtacviet.com has it; this project's owner
  explicitly doesn't want audio/voice features). Word-level Hán-Việt
  reading tooltips, unlike TTS, ARE in scope -- see "Interactive reader"
  above.
- No self-service READER→EDITOR upgrade path, no password reset/email
  verification flow, no OAuth sign-in -- all deliberately out of scope
  for a small, trusted-editor product (see "User management and per-word
  overrides" above).
