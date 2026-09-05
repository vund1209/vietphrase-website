# vietphrase-website

Chinese → Vietnamese novel translation site using the VietPhrase technique
(dictionary-based phrase substitution), with a readability layer on top and
an editable dictionary the user builds up over time.

## Project status

The Next.js app is scaffolded and has one working end-to-end feature: the
**translate page** (`/translate`), which posts Chinese text to
`/api/translate` and gets back a VietPhrase translation from
`packages/tokenizer` reading `data/seed/dictionary_seed.db` directly. This
was verified to reproduce a real sangtacviet.com sample translation
exactly. The reading library (book URL → chapters → lazy scrape-on-view)
and the Postgres/Prisma backend are still design-only — see
`docs/DICTIONARY_SOURCES.md` for how the seed dictionary was built,
`docs/VIETPHRASE_CORE.md` for how the translation engine itself works, and
`docs/ARCHITECTURE.md` for how the site's three features (reading library,
"live scrape/surf", translate page) fit together as one pipeline, and
`docs/ENVIRONMENT.md` for the exact Python/Node/npm versions this runs on
— all written before the app exists so none of it gets lost.

**Read `docs/ENVIRONMENT.md` before assuming anything here "just works"**:
most of this repo was built and tested through a bridged environment
running different Node/Python versions than the real target machine —
that doc explains exactly what's unverified and how to check it.

## Getting started

```
npm install
npm run dev
```

Then visit `http://localhost:3000/translate` and paste Chinese text in the
input box to get a VietPhrase translation — this reads
`data/seed/dictionary_seed.db` directly via `packages/tokenizer`, no
database setup required for this page.

The home page (`/`) is the reading library: paste a book's chapter-list
URL to add it, then click through to read chapters (scraped and
translated lazily, on first view, and cached after). Needs a working
`DATABASE_URL`/`DIRECT_URL` in `.env` (see `.env.example`) and, if
you're running this through Claude Code Remote's bridged Linux
environment rather than natively, a `npx prisma generate` re-run to pick
up `prisma/schema.prisma`'s `binaryTargets` — see "Next up" below.

To run the whole test suite (tokenizer + the scraper's extraction
heuristics):

```
npm test
```

See "Next up" below for what's implemented vs. still open.

## Structure

```
vietphrase-website/
├── data/
│   └── seed/
│       ├── dictionary_seed.db          # ready-to-use SQLite seed DB
│       ├── build_dictionary.py         # reproducible merge/clean pipeline
│       ├── migrate_split_schema.py     # one-time v2->v3 schema migration (see docs)
│       ├── VietPhrase.truyencuatui.txt # raw source (v1)
│       ├── CVDICT.u8                   # raw source (v1)
│       └── hanviet-pinyin.csv          # raw source (v1)
├── docs/
│   ├── ARCHITECTURE.md                 # product architecture: how the site's 3 features fit together
│   ├── VIETPHRASE_CORE.md              # how the translation engine works (algorithm, open decisions)
│   ├── ENVIRONMENT.md                  # exact tool versions this runs on, and a version-gap caveat
│   └── DICTIONARY_SOURCES.md           # full source evaluation + build report
├── .nvmrc                              # pins Node to the versions in ENVIRONMENT.md
├── .python-version                     # pins Python to the versions in ENVIRONMENT.md
├── src/
│   ├── app/                            # Next.js App Router: /, /translate, /novels/..., /api/...
│   └── lib/                            # Prisma client, tokenizer singleton, scraper + extractors
├── packages/
│   └── tokenizer/                      # production tokenizer module (tested, no npm deps)
├── prisma/
│   └── schema.prisma                   # live-app Postgres schema (forward design, no app yet)
├── prototype/
│   └── tokenizer.mjs                   # superseded validation script, kept for history only
├── ref/                                 # vendor reference clones (gitignored, see below)
└── README.md
```

`ref/` isn't included in deliverables — it's ~375 MB of cloned reference
repos used to build the dictionary. See "Reproducing this build yourself" in
`docs/DICTIONARY_SOURCES.md` for the exact clone commands if you want them
locally too. Everything useful that came out of them is already merged into
`dictionary_seed.db`, or explicitly called out in the docs as a phase-2
reference (e.g. `rule.txt`'s grammar-rule DSL, `LacViet.txt`/`ThieuChuu.txt`
for a future detailed-lookup panel).

## Seed dictionary snapshot

| Table | Rows | Notes |
|---|---|---|
| `words` | 1,432,932 | bulk phrase substitutions, rebuilt from source |
| `names` | 276,248 | proper nouns; `novel_id` nullable (NULL = global; all seed rows are global) |
| `pronouns` | 1,427 | pronoun substitutions, tuned for readability |
| `hanviet_fallback` | 17,564 | single-character Han-Viet reading, last-resort fallback |
| `scrape_blacklist` | 274 | scrape-time text-cleaning patterns |

Schema v3: `words` / `names` / `pronouns` are separate tables, not one
`dictionary_entries` table with a `category` column — see
`docs/DICTIONARY_SOURCES.md` ("Schema v3") for the reasoning. `names` also
gained `novel_id` (nullable, for future per-novel name overrides),
`is_active`, and `updated_at`, in anticipation of per-story curation once
the app exists.

## Next up

- **Done**: Prisma/Postgres wiring, tokenizer per-novel override
  support (`src/lib/overrides.ts` + `packages/tokenizer`'s `overrides`
  Map, see `docs/ARCHITECTURE.md` "Data split").
- **Done**: the reading library itself -- book-add-by-URL, chapter
  list, lazy scrape-on-view chapter page. `src/lib/extract/` has the
  generic chapter-list/content extractors (26 unit tests against
  synthetic HTML, plus structurally validated against two real sites --
  book.sfacg.com and 69shuba.com -- see `docs/ARCHITECTURE.md` "Scraping
  strategy"), `src/app/api/novels/...` has the API routes, and `/`,
  `/novels/[slug]`, `/novels/[slug]/chapters/[number]` have the UI.
  `npx prisma generate` has been re-run on the real machine with the
  added `binaryTargets`, so the generated client works from both the
  real Windows machine and the bridged Linux dev environment.
- **Still open**: a true live end-to-end pass (add a real book, scrape a
  real chapter, confirm it lands in Neon) hasn't been run yet -- the
  bridged Linux dev environment can't reach Neon's Postgres endpoint at
  all (network-egress allowlist blocks it, same as it blocks fetching
  book.sfacg.com/69shuba.com pages directly), so this needs to be run on
  the real machine directly: `npm run dev`, then add
  `https://book.sfacg.com/Novel/530508/` or `https://www.69shuba.com/
  book/90442.htm` (or any book/chapter URL) through the home page's
  add-book form and confirm a chapter reads correctly. If either real
  site's structure trips up the generic extractor, add a per-site
  adapter (`src/lib/extract/adapters.ts`) for it.
- **Done, migration applied**: user accounts (email + password,
  READER/EDITOR roles) and per-word interactive overrides -- click any
  translated word while reading to see its Hán-Việt reading and its
  VietPhrase translation side by side, save a fix that's private to you,
  and (if you're an EDITOR) promote a good fix into the shared
  dictionary everyone sees. `npx prisma migrate dev` +
  `npx prisma generate` have been run on the real machine; typecheck and
  lint are clean. See `docs/ARCHITECTURE.md` "User management and
  per-word overrides" for the full design. **Still needed**: a real
  `AUTH_SECRET` in `.env` for anything beyond your own machine (a
  dev-only one was generated locally; see `.env.example`), and a manual
  end-to-end pass (sign up, edit a word, promote as an editor) since
  this assistant's dev environment can't reach Neon directly (same
  limitation as the scraping end-to-end test above).
- Phase 2: implement the `rule.txt`-style grammar-reorder DSL for real
  readability gains beyond phrase substitution (see docs for details).
