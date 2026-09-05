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

## Data access: avoid per-lookup DB round-trips

The current `packages/tokenizer` implementation (used as-is by
`/api/translate` today) queries SQLite once per candidate substring while
scanning for the longest match -- fine for a local SQLite file (same
process, no network), but this must **not** carry over unchanged once the
tokenizer is pointed at Postgres/Prisma. One network round-trip per
candidate substring, over a real chapter of text, would be slow and
would hammer the database on every single translation.

Before wiring the tokenizer to Postgres, it needs to load the relevant
dictionary tables (or the relevant per-novel slice of `names`, plus all of
`pronouns`/`words`/`hanviet_fallback`) into an in-memory structure once
(at process startup, or lazily on first use and then cached), and do all
longest-match scanning against that in-memory structure instead of
issuing a query per lookup. This is a correction to the original design,
not yet implemented -- `packages/tokenizer` still talks to SQLite
directly as of this writing. Flagging it here so it isn't forgotten once
the Prisma migration work starts.

## Hosting: cloud Postgres free tier

Decided: a cloud free-tier Postgres provider (Neon or Supabase), not a
self-hosted database, for v1 -- no infra to manage, generous enough free
tier for a project at this stage. Not yet narrowed to one specific
provider; either is Prisma-compatible. Once picked, the real
`DATABASE_URL` goes in a local `.env` (never committed -- copy the root
`.env.example`), and this doc should be updated to say which was chosen
and why.

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
