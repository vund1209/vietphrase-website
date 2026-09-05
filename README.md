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
database setup required for this page. The home page (`/`) links to it;
the reading-library link there is a disabled placeholder for now.

To run the tokenizer's own test suite:

```
npm test --workspace=@vietphrase/tokenizer
```

Prisma/Postgres are not wired up yet — `prisma/schema.prisma` is a forward
design, not a running database. See "Next up" below.

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
│   └── app/                            # Next.js App Router: /, /translate, /api/translate
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

- **Done**: Prisma/Postgres wiring. Neon is live (free tier,
  ap-southeast-1), `prisma/schema.prisma` is verified against it (`npx
  prisma migrate dev` applied cleanly), and the migration history is
  committed under `prisma/migrations/`. See `docs/ARCHITECTURE.md`
  "Hosting: cloud Postgres free tier — Neon" and "Data split" for what's
  actually in Postgres now: only `Novel`/`Chapter`/per-novel `Name`
  overrides, **not** a copy of the bulk dictionary (see below) — no
  seed-import script needed, and none is planned.
- **Tokenizer: per-novel override support.** `packages/tokenizer` still
  only reads `data/seed/dictionary_seed.db` directly, which is correct
  and stays that way for the bulk dictionary (see "Data split" in
  `docs/ARCHITECTURE.md` for why it's *not* moving to Postgres). What's
  still missing: an optional per-novel overrides map, fetched from
  Postgres's `Name` table in one query per chapter translation (not one
  query per substring), checked before the SQLite global names/pronouns/
  words. Not implemented yet.
- Scaffold the reading library: book-add-by-URL, chapter list, lazy
  scrape-on-view chapter page, using the generic-extraction-plus-adapters
  scraping strategy in `docs/ARCHITECTURE.md`.
- Phase 2: implement the `rule.txt`-style grammar-reorder DSL for real
  readability gains beyond phrase substitution (see docs for details).
