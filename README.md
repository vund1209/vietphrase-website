# vietphrase-website

Chinese → Vietnamese novel translation site using the VietPhrase technique
(dictionary-based phrase substitution), with a readability layer on top and
an editable dictionary the user builds up over time.

## Project status

Currently at the **data preparation** stage — no app code yet. See
`docs/DICTIONARY_SOURCES.md` for the full writeup of how the seed dictionary
was built, and `docs/VIETPHRASE_CORE.md` for how the translation engine
itself is designed to work (tokenizer algorithm, lookup priority, open
decisions) — written before the app exists so none of it gets lost.

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
│   ├── VIETPHRASE_CORE.md              # how the translation engine works (algorithm, open decisions)
│   └── DICTIONARY_SOURCES.md           # full source evaluation + build report
├── prisma/
│   └── schema.prisma                   # live-app Postgres schema (forward design, no app yet)
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

- `prisma/schema.prisma` has the live-app Postgres schema drafted (words /
  names / pronouns / hanviet_fallback / scrape_blacklist + novels, with
  per-novel name scoping) — see the comments in that file for the design
  rationale. Not yet wired to a running app or migrated anywhere.
- Scaffold the Next.js app (tokenizer engine, reader UI, dictionary editor,
  scraper) per the architecture discussed — not started yet. Part of that
  work is a one-time import script loading `dictionary_seed.db` into the
  Postgres schema above (via the reserved "global" Novel row for names).
- Phase 2: implement the `rule.txt`-style grammar-reorder DSL for real
  readability gains beyond phrase substitution (see docs for details).
