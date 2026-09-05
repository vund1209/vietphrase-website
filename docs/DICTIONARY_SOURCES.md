# Dictionary sources — evaluation & build report

This documents every source evaluated for the VietPhrase seed dictionary,
what was merged, what was intentionally left out (and why), and how to
reproduce the build yourself.

## TL;DR — what's in `data/seed/dictionary_seed.db`

| Table | Rows | What it's for |
|---|---|---|
| `words` | 1,489,074 | general phrase substitutions |
| `names` | 276,268 | proper nouns — characters, places, sects, techniques (new in v2; own table since v3) |
| `pronouns` | 1,427 | pronoun substitutions, tuned for readability (new in v2; own table since v3) |
| `hanviet_fallback` | 17,564 | single-character Hán-Việt reading, last-resort fallback |
| `scrape_blacklist` | 274 | junk line/paragraph patterns seen in real scraped novel text (site ads, "to be continued" banners) — for cleaning raw chapter text at scrape time, not part of translation |

As of schema v3, these were split out of a single `dictionary_entries`
table with a `category` column into dedicated tables — see "Schema v3"
below for why.

DB file size: ~245 MB (up from ~95 MB in v1 — this reflects real added
coverage, not bloat: total phrase-style entries went from ~799K to ~1.77M).

## Sources merged in this build

### Phrase dictionary (`category='word'`), in priority order (earlier wins on conflict)

1. **hoangtuantk/Vietphrase** (`ref/Vietphrase/data/Vietphrase.txt`, 1,112,890 raw lines) —
   by far the largest and most comprehensive single source found; contributed
   1,112,867 entries outright. Also covers kana/zhuyin/Latin edge cases (see
   "Known quirks" below).
2. **TienDich** (`ref/TienDich/data/Vietphrase.txt`, 960,696 lines) — contributed
   137,241 *new* keys not already covered by #1.
3. **file-vietphrase** (`ref/file-vietphrase/VietPhrase.txt`, 763,748 lines) —
   45,704 new keys.
4. **truyencuatui/VietPhrase** (the original v1 source, 679,271 lines) — 43,046
   new keys. Kept in the merge order for continuity with the original build.
5. **script-vietphrase-translator** (`ref/script-vietphrase-translator/Vietphrase.txt`,
   153,069 lines) — 39,041 new keys.
6. **CVDICT** (CEDICT-derived, v1 source) — 111,176 new keys, gap-filling only.

### Proper nouns (`category='name'`) — new in this build

QuickTranslator-style tools always treat Name as higher priority than
VietPhrase during lookup — that convention carries over here.

1. **script-vietphrase-translator/Names.txt** (187,815 lines) — the biggest and
   cleanest Names file found; 186,762 entries, essentially zero junk.
2. **hoangtuantk/Vietphrase/data/Names.txt** (90,240 lines) — 52,293 new keys
   (21 chapter-title artifacts filtered out).
3. **file-vietphrase/NamebaseR03.txt** (46,319 lines) — 25,166 new keys.
4. **file-vietphrase/Names.txt** (77,124 lines) — 10,226 new keys.
5. **TienDich/data/Names2.txt** (159,801 lines) — only 1,755 new keys survived
   filtering; **64,507 of its 159,801 lines were chapter-title/number-format
   artifacts** (e.g. `第三千六百二十四章=Chương 3624:`, `7247 亿=7247 ức`) —
   this file is real per-novel translation memory, not a curated Names list,
   so it's heavily diluted with one-off junk. Dropped automatically by the
   `is_chapter_or_number_artifact()` filter in the build script.
6. **TienDich/data/Names.txt** (153,339 lines) — same story, worse ratio:
   **60,437 of its lines are pure chapter-title patterns** (`正文 001=Chương 1:`
   repeated for hundreds of chapters). Only 66 new keys survived.

Spot-checked against known novels post-merge — resolves correctly, e.g.
`萧炎` → `Tiêu Viêm` (Đấu Phá Thương Khung / Battle Through the Heavens),
`唐三` → `Đường Tam` (Đấu La Đại Lục / Soul Land).

### Pronouns (`category='pronoun'`) — new in this build

This is the single highest-leverage readability fix available: literal
character-by-character pronoun translation reads badly, and these tables are
hand-curated to sound natural.

1. **script-vietphrase-translator/Pronouns.txt** (1,478 lines) — 1,425 entries,
   used as primary.
2. **TienDich/Pronouns.txt** / **hoangtuantk/DaiTuNhanXung.txt** — both turned
   out to be the *same* 28-entry curated list (word-for-word identical
   content, confirming it's shared/copied across these community tools).
   Only 2 new keys survived after dedup against source #1.

### Hán-Việt single-character fallback

Primary table unchanged from v1 (`hanviet-pinyin-wordlist`, pinyin-disambiguated).
Added gap-filling from:

- **script-vietphrase-translator/ChinesePhienAmWords.txt** (17,087 lines) —
  4,319 new characters not in the pinyin table.
- **file-vietphrase/ChinesePhienAmWords.txt** (12,791 lines) — 20 new.
- **TienDich/ChinesePhienAmWords.txt** (12,564 lines) — 0 new (fully covered
  by earlier sources by the time this was processed).
- **ThieuChuu.txt** (10,027 lines, classical Thiều Chửu dictionary) — 0 new
  (same reason), but see "Kept for later" below — its real value is the rich
  multi-sense definitions, not just the reading.
- **file-vietphrase/PhienAmbaseR01.txt** (59 lines) — 52 new symbol entries:
  Greek letters (α=alpha), Roman numerals (Ⅳ=IV), math symbols (∞=vô cực),
  and a handful of rare chemical-element Han characters. Small but these are
  exactly the kind of char your tokenizer would otherwise silently drop.

### Scrape blacklist (new table, not wired into the app yet)

- **TienDich/IgnoredChinesePhrases.txt** (237 lines) — real observed ad/watermark
  paragraphs from scraped novel sites (site plugs, "to be continued" banners,
  forum footers).
- **hoangtuantk/Vietphrase/data/Blacklist.txt** (42 lines) — a cleaner,
  shorter curated version of the same idea.

This isn't a dictionary at all — it's line/paragraph patterns to strip out of
**raw scraped Chinese text before translation**. Recommend your scraper
pipeline run each chapter's raw text through a "does this line contain a
blacklist substring" filter before it ever reaches the tokenizer.

## Kept as reference only (not merged — phase 2 candidates)

These are staying in `ref/` for now because they need real engineering work
to use well, not just data cleaning. Flagging clearly so they don't get lost.

### `rule.txt` (script-vietphrase-translator) — **the most valuable phase-2 find**

A genuinely well-designed template-rule DSL for the "grammar reorder" pass we
discussed wanting to build — the exact "readability upgrade over classic
VietPhrase" feature. It defines typed placeholders:

```
<n>  : Chinese-or-Arabic numeral run (handles 十百千万萬亿億)
<y>  : digit-by-digit number (years, IDs)
<L>  : chapter-label word (章卷集节節幕回折) -> generates the Vietnamese label
<ne> : Name-dictionary match     <pn> : Pronoun-dictionary match
<vp> : VietPhrase-dictionary match     <hv> : single Han-Viet character
<w>  : shorthand for ne|pn|vp, tried left-to-right
:min-max on any token = character-count bounds; (a|b) = alternation group
{0},{1},... = back-references to captured tokens, in appearance order
```

675 lines of rules built on this, covering dates, durations, time-of-day
ranges, etc. — e.g. `<y:3-4>年<n:1-2>月<n:1-3>(日|号|號) = ngày {2} tháng {1} năm {0}`
correctly reorders a Chinese date into Vietnamese day-month-year order,
which no amount of phrase-dictionary substitution alone can do.

**Recommendation:** implement your grammar-reorder module as an interpreter
for this same rule format. It's already been through real production use, and
adopting the format means you can pull in the accompanying 675 rules directly
instead of writing your own from scratch.

### `LuatNhan.txt` (two variants: truyencuatui's 7,025-line version, TienDich's
286-line version) — an older, simpler ancestor of the same idea using bare
`{0}` placeholders with no typed tokens. Superseded by `rule.txt` above; kept
for reference/comparison only.

### `LacViet.txt` (TienDich, 66,449 lines) and `ThieuChuu.txt` (TienDich, 10,027
lines) — rich classical Chinese-Vietnamese dictionaries with numbered senses
and example usage (from the LacViet MTD software and the Thiều Chửu Hán-Việt
dictionary respectively). Far too detailed for phrase substitution, but ideal
source data for a **"detailed lookup" panel** — e.g. when a user clicks a
translated phrase to edit it, show these fuller definitions alongside the
short VietPhrase gloss for context. Not wired in yet; needs its own
`detailed_definitions` table and a parser for the `\n`/`\t`-escaped
multi-sense format.

### `vietphrase-app/qtran/` (qwarl/vietphrase-app) — a full research-grade
alternative engine, way beyond a phrase-substitution tool. It ports grammar
rules and POS-tag handling from an external **qtran-mt** project (itself built
on a **chi-vi** Chinese-Vietnamese corpus and a **zvterm** dictionary), uses an
LTP (Language Technology Platform) backend for real Chinese POS tagging, and
literally A/B-compares its output against classic VietPhrase in the same UI.
This is a legitimate deep-dive if you ever want to go beyond phrase
substitution into real grammatical reordering — but it depends on a live NLP
backend (`ltpcv`) and is a project in its own right, not a drop-in data
source. Worth reading `ref/vietphrase-app/qtran/README.md` and
`qtran-grammar.js`/`qtran-postag.js` for design ideas whenever you get to the
grammar-reorder phase.

### `Vietphrase_Number.txt` (hoangtuantk, 124,410 lines) and
`Vietphrase_Chapter.txt` (hoangtuantk, 71,120 lines) — **deliberately not
imported**. These are brute-force literal tables (`1000万=1000 vạn`,
`1001万=1001 vạn`, ... for every number the original tool's author ever hit)
generated because the underlying engine had no real number parser. Importing
them would bloat the DB with effectively infinite combinations and still miss
numbers nobody happened to translate yet. **The right fix is an algorithmic
Chinese-numeral-to-Vietnamese converter function in your tokenizer**
(handling 十/百/千/万/亿 positional numerals + arabic digits), which the
`<n>`/`<y>` tokens in `rule.txt` above are already designed to hand off to.
Chapter titles are the same story — `第N章` should be a formatting rule
(`Chương {N}:`), not a stored literal per chapter number.

### Not usable / not merged

- **amazing-cultivation-simulator-vietphrase** — a Vietnamese translation mod
  for a cultivation-sim video game (not novel text). Game UI strings and item
  names don't transfer to novel translation quality; left untouched in `ref/`
  in case you're curious, but not part of the dictionary build.
- **Vietphrase-userscript** (duxonem) — browser-extension source code only,
  no bundled dictionary data (it loads dictionaries from IndexedDB at
  runtime). Good architecture reference for a future browser-extension
  companion, not a data source.
- **novel-translate-CV** — its one data file (`custom-global.txt`) is stored
  via Git LFS, and the actual content wasn't fetchable in this environment
  (LFS media host isn't reachable from here). If you want this one, `git lfs
  pull` it yourself locally and let me know what's inside — happy to fold it
  in.

## Known quirks worth knowing about

- hoangtuantk's big Vietphrase.txt (our #1 word source) also contains
  Japanese kana/katakana romanization (`く=ku`), Zhuyin/Bopomofo symbols
  (`ㄅ=bao/ba`), and at least one stray Latin-only "entry"
  (`international_consumer_electronicsshow=International Consumer Electronics
  Show`). Harmless for a Chinese-text tokenizer (it'll never match non-CJK
  keys against CJK input), but if you ever expose a "browse the dictionary"
  admin view, expect some non-Chinese rows to show up.
- Name/Vietphrase alternate-translation separators are inconsistent across
  sources — most use `/`, file-vietphrase's Names.txt sometimes uses `|`. The
  build script normalizes everything to `/`.

## Reproducing this build yourself

Clone the eight reference repos into `ref/` (already `.gitignore`d — see
`.gitignore` at the project root; these are vendor reference data, not
project source):

```bash
mkdir ref && cd ref
git clone --depth 1 https://github.com/duxonem/Vietphrase-userscript.git
git clone --depth 1 https://github.com/hoangtuantk/Vietphrase.git
git clone --depth 1 https://github.com/duongden/script-vietphrase-translator.git
git clone --depth 1 https://github.com/ParadoxParadise/TienDich.git
git clone --depth 1 https://github.com/QuangNguyenLong/amazing-cultivation-simulator-vietphrase.git
git clone --depth 1 https://github.com/ldhieu304/file-vietphrase.git
git clone --depth 1 https://github.com/qwarl/vietphrase-app.git
git clone --depth 1 https://github.com/kvsx0810/novel-translate-CV.git
```

Then, from `data/seed/`:

```bash
pip install opencc-python-reimplemented
python3 build_dictionary.py
```

It reads `../../ref/...` paths plus the three v1 raw files already sitting in
`data/seed/` (`VietPhrase.truyencuatui.txt`, `CVDICT.u8`, `hanviet-pinyin.csv`),
and rebuilds `dictionary_seed.db` from scratch — deterministic, safe to rerun
any time you update a source.

## Licensing reminder

Same as v1 (CC BY-SA 4.0 for CVDICT and the hanviet-pinyin-wordlist under MIT)
— plus these newly merged community datasets don't carry explicit licenses in
their repos, same "attribution-required community content" treatment as the
original VietPhrase.txt. Keep a credits/about page if the site goes public.


## Schema v3 — separate tables + per-novel name scoping (2026-09-05)

The original v2 schema stored words, names, and pronouns in one
`dictionary_entries` table distinguished by a `category` column. This has
been split into three dedicated tables — `words`, `names`, `pronouns` —
migrated via `data/seed/migrate_split_schema.py` (a one-time, idempotent
script; re-running `build_dictionary.py` from a fresh `ref/` clone now
produces this schema directly).

Reasoning:

- **Different lifecycle.** `words` and `pronouns` are bulk, rebuilt-from-source,
  effectively read-only. `names` is the table end users will actually curate
  over time, novel by novel.
- **`names` needs scoping `words`/`pronouns` don't.** A `novel_id` column
  (nullable; NULL = global fallback) was added to `names` so a character's
  name can be consistently overridden within one novel without touching the
  global dictionary or colliding with another novel's override of the same
  Chinese phrase. This seed database ships no `novels` table — `novel_id` is
  NULL for every row here — the live app owns `novels` and the foreign-key
  relationship.
- **Uniqueness needed a partial index, not a plain composite one.**
  `UNIQUE(chinese_phrase, novel_id)` alone would NOT stop duplicate *global*
  rows, because SQL treats every NULL as distinct from every other NULL.
  Two partial unique indexes are used instead: `idx_names_global` enforces
  one global row per phrase (`WHERE novel_id IS NULL`), and
  `idx_names_scoped` enforces one row per phrase within a given novel
  (`WHERE novel_id IS NOT NULL`).
- **`names` also gained `is_active` and `updated_at`**, anticipating
  soft-delete/edit-history needs once users can edit entries; `words` and
  `pronouns` didn't get these since they're not edited row-by-row.
- **Lookup keys are now NFC-normalized** (`unicodedata.normalize("NFC", ...)`,
  trimmed) at both build and migration time, so entries pulled from sources
  with inconsistent Unicode composition don't silently fail to match at
  lookup time. This collapsed exactly 1 duplicate word key on migration
  (1,489,075 -> 1,489,074) — expected and harmless.

This split intentionally does not extend to `pronouns` getting its own
scoping, or to a full edit-history table for `names` — both are easy to add
later if needed, and weren't worth the complexity before the app exists to
use them.
