# VietPhrase core — how translation actually works

This is the authoritative spec for the translation engine itself: the
tokenizer/lookup algorithm, the priority rules between dictionaries, and
the open decisions that haven't been implemented yet. `DICTIONARY_SOURCES.md`
covers where the *data* came from; this doc covers what happens to a raw
Chinese chapter between scraping it and showing the user Vietnamese text.

Nothing here is implemented yet (no app code exists) — this is written now,
before the app is scaffolded, specifically so these decisions survive the
gap between "we discussed it" and "someone sits down to code it."

## The technique, in one paragraph

VietPhrase is dictionary-based phrase substitution, not machine translation:
scan the Chinese text left to right, and at each position replace the
longest matching known phrase with its stored Vietnamese translation. No
model, no context window — just longest-match lookup against a large
curated phrase dictionary, plus a fallback to a single-character Han-Việt
reading when nothing matches. Readability beyond that (grammar reordering,
pronoun resolution) is layered on top as separate passes, described below.

## Pipeline, end to end

```
raw scraped chapter text
        |
        v
[1] scrape_blacklist filter   -- strip ad/watermark/footer lines & paragraphs
        |
        v
[2] grammar-rule pre-pass      -- rewrite dates, numerals, chapter labels
    (rule.txt DSL, see below)     using the <n>/<y>/<L> token patterns,
        |                          BEFORE generic phrase substitution breaks
        |                          them into meaningless word-by-word chunks
        v
[3] longest-match tokenizer    -- the core loop, see below
        |
        v
[4] (future) readability pass  -- anything grammar-rule matching didn't
                                   already handle; not scoped yet
        |
        v
Vietnamese chapter text
```

Step [1] and step [2] both need to run **before** step [3], and in that
order: blacklist filtering removes whole lines that would otherwise pollute
tokenization, and the date/numeral rules need to see intact numeral runs
(`2006年08月24日`) before the tokenizer starts chopping the string into
1-6 character phrase-dictionary matches.

## The core loop: longest-match tokenization

At each position in the input, moving left to right:

1. Try match lengths from longest to shortest (see "window size" below).
   At each candidate length, look up the substring against, **in this
   priority order**:
   1. Per-novel `Name` overrides (Postgres, `novelId = <this novel>`) --
      only present once the live app exists; empty for the standalone
      translate page, which has no novel context at all
   2. `names` global fallback (SQLite seed, `data/seed/dictionary_seed.db`
      -- its own `novel_id IS NULL` rows; see "Per-novel name resolution"
      below for why this is a *different table in a different database*
      than (1), not a fallback row within the same table)
   3. `pronouns` (SQLite seed)
   4. `words` (SQLite seed)
2. The first hit — at the *longest* length any of the four sources match —
   wins. Category priority only breaks ties *within* the same match
   length; a longer `words` match beats a shorter `names`/`pronouns` match
   at the same position.

   **`pronouns` must be checked before `words`, not after — corrected
   after testing against real text (see "Validation" below).** The
   original assumption, carried over loosely from "Name beats VietPhrase"
   conventions in the source tools, was name > word > pronoun. Running the
   prototype tokenizer showed this was wrong: every common pronoun
   (他/他们/自己/我/你 checked directly) exists in **both** `words` and
   `pronouns`, because some merged phrase-dictionary sources included
   pronouns too. `words` gives the messier, multi-sense entry (e.g. 他 →
   `hắn/nó/khác`, mixing the pronoun sense with "other"); `pronouns` gives
   the clean, curated sense (他 → `hắn`) that the whole table exists for.
   With word checked first, the curated pronoun table was being shadowed
   for exactly the phrases it was built to fix — checking `pronouns`
   before `words` at each length restores the intended behavior.
3. If nothing matches at any length, consume exactly one character and
   look it up in `hanviet_fallback`. If even that's missing, emit the raw
   character unchanged (this will happen — see the CJK Extension /
   rare-character gap noted below).
4. Advance past however many characters were consumed and repeat.

### Window size

Actual phrase lengths in the current seed data:

| Table | Shortest | Longest | Notes |
|---|---|---|---|
| `words` | 1 | 42 | the 42-char entries are full classical idioms/proverbs (e.g. 老吾老以及人之老幼吾幼以及人之幼) |
| `names` | 1 | 38 | |
| `pronouns` | 1 | 6 | overwhelmingly 1-3 chars |

A tokenizer that tries every length from 1 up to 42 at every position is
correct but wasteful, since >99% of real matches are 1-4 characters. Cap
the practical scan window (e.g. 12-16 chars) for the hot path, and either
accept that the rare 20+ char idioms won't be caught, or special-case a
short list of known long entries separately. This tradeoff hasn't been
decided — flagging it here so it's a conscious choice later, not an
accident of whatever window size someone picks while coding the first
draft.

### Alternate translations

Many entries store multiple accepted translations separated by `/`
(e.g. `这` → `cái này/là cái này/giá/này/vậy/đây`). **Which one the
tokenizer should emit by default is not decided yet.** Options: always
take the first (current sources generally ordered these with the most
common rendering first, but this isn't verified), or make it
context-sensitive later. This needs a decision before the tokenizer ships
a v1, even a naive one (take-first is the obvious placeholder).

### Han-Viet reading, alongside (not instead of) the phrase translation

**Added 2026-09-05**, per the project owner's explicit request after
reviewing sangtacviet.com's reader (see `docs/ARCHITECTURE.md` "User
management and per-word overrides"). Every `Token` now carries a
`hanViet` field: the character-by-character Sino-Vietnamese reading of
`chinese`, computed independently of `vietnamese`.

This is deliberately a *different* value from `vietnamese`, not a
fallback for it: `vietnamese` is the contextual VietPhrase substitution
(from `names`/`pronouns`/`words` -- a real phrase, name, or idiom, which
is often nothing like a literal character-by-character reading);
`hanViet` is always the literal reading, looked up per-character against
`hanviet_fallback` (the same table already used as the last-resort
fallback for a genuinely unmatched character -- see "The core loop"
above), falling back to the raw character itself if even that table has
no entry. It's computed for every token regardless of `source`
(`name`/`pronoun`/`word`/`hanviet_fallback`/`unmatched` alike), because
comparing "what VietPhrase chose" against "what the characters literally
read as" is useful everywhere, not just for the unmatched-character path.

Cost: one extra `hanviet_fallback` point lookup per character of every
resolved token (`VietPhraseTokenizer._hanVietFor()` in
`packages/tokenizer/src/tokenizer.mjs`), on top of the existing longest-
match scan. For chapter-length text this is a modest, in-process SQLite
overhead -- the same class of cost the tokenizer already pays during the
longest-match scan itself, not a new order of magnitude.

## Validation, and the production module


`prototype/tokenizer.mjs` is a zero-dependency Node script (uses the
built-in, experimental `node:sqlite`) implementing the algorithm above
directly against `dictionary_seed.db`. It was a throwaway validation
tool — the point was to find out whether the merged dictionary actually
produces usable output before building the real app around it — and it's
kept only as the historical record of that validation run. Run it with
`node prototype/tokenizer.mjs`.

**`packages/tokenizer` is the production module**, promoted from that
prototype once it proved out. Same algorithm, same data source for now
(interim: reads `dictionary_seed.db` directly; will move to Prisma/
Postgres queries once that exists, without changing its `tokenize()`
contract), but with proper types (JSDoc), a pluggable alternate-
translation selector, per-novel scoping support, and a real test suite
(`npm test` in that package — 11 tests: isolated unit tests against a
synthetic database, plus real-data regression spot-checks). This is what
future app code should import; the prototype is not meant to be reused.

Result against a 102-character synthetic test paragraph (mixing known
names, common vocabulary, pronouns, and a date): 32 word matches, 2 name
matches, zero missing-vocabulary failures — every unmatched character was
punctuation or a digit, never an actual CJK word the dictionary should
have covered. That's a strong signal the merged dictionary's coverage is
solid. It's also what surfaced the pronoun-priority bug above, and the
data-quality issue below — exactly why this was worth doing before
writing more code or docs on unverified assumptions.

Two gaps the test also confirmed, not yet fixed:

- **Punctuation passes through untouched** (，。 etc. are emitted as-is).
  Not a dictionary problem — just needs a straightforward full-width to
  Vietnamese-punctuation mapping step, unrelated to phrase lookup.
- **Digit/date handling is inconsistent**, exactly as "Grammar-reorder
  rules" below already anticipated: `2006年08月24日` came out as
  `2 0 0 6 năm 0 ngày hai mươi bốn tháng tám` — fragmented and wrong. See
  the data-quality issue immediately below for *why* part of it
  half-worked.

## Confirmed data-quality issue: numeral/date junk leaked into `words`

`DICTIONARY_SOURCES.md` documents that Names parsing filters out chapter-
title and number-format artifacts (`is_chapter_or_number_artifact()` in
`build_dictionary.py`) before merging, because several Name source files
were heavily polluted with these. **That same filter was never applied to
the Words merge.** Checked directly against the live data:

```
17,280 rows in `words` start with a digit
```

Sample rows confirm these are exactly the same kind of junk the Names
filter exists to remove — one-off literal translation-memory entries from
real scraping runs, not general-purpose dictionary content:

| chinese_phrase | vietnamese_phrase |
|---|---|
| `第 1692+1693+1694 章` | `Chương 1692+1693+1694` |
| `2006 年 08 月 24rì` | `24 tháng năm 2006` (note: `rì` — a stray romanization typo baked into the key itself) |
| `2013 年 10 月 27 日` | `Ngày 27 tháng 10 năm 2013` |
| `4289 年 12 月 31 日` | `ngày 31 tháng 12 năm 4289` |

This explains the "8月24日 → ngày hai mươi bốn tháng tám" match in the
validation run above: it's not the tokenizer or a grammar rule working
correctly, it's a literal one-off entry happening to exist for that exact
substring. It won't exist for the next date the tokenizer meets, which is
exactly the failure mode `DICTIONARY_SOURCES.md` already warned about for
the numeral tables it deliberately declined to import wholesale
(`Vietphrase_Number.txt`, `Vietphrase_Chapter.txt`).

**Fixed.** `build_dictionary.py` now applies `filter_chapter_junk=True` to
the Word merge (previously only Names opted in), plus a new general
`is_number_unit_artifact()` check catching the shape CHAPTER_JUNK_PATTERNS'
specific date/chapter regexes didn't enumerate — bare "N年" (year, no
month/day), "N点钟" (a time), "N里"/"N两"/"N级" (a measurement/rank), etc.
Rebuilt from a fresh `ref/` clone: digit-leading `words` rows went from
17,280 -> 321 (98% reduction), with the remaining 321 being mostly
legitimate OCR/typo-correction entries (`4ooo` -> `4000`, `5 o` -> `50`)
rather than junk — a reasonable stopping point, since chasing those risks
false positives on entries that are actually useful. `words` total:
1,489,074 -> 1,432,932.

Re-running the prototype tokenizer confirms the fix changed behavior as
intended: `2006年08月24日` no longer hits the lucky one-off literal
`8月24日` entry (now removed) and instead falls back consistently to
per-character matches (年 -> `năm`, 月 -> `tháng`, 日 -> `ngày`, digits
unmatched). That's not good output — it's still fragmented — but it's
now *honestly* fragmented every time, rather than silently correct for
one specific date and wrong for every other one. Fixing this for real is
still the grammar-rule interpreter's job (above), not more dictionary
cleaning.

## Known risk: Simplified vs. Traditional Chinese are NOT normalized

Checked directly against the current seed data — both scripts are present
as separate, independently-translated keys, e.g.:

| Simplified | Traditional |
|---|---|
| `国` → `quốc/nước` | `國` → `quốc` |
| `说` → `nói/thuyết` | `說` → `nói` |
| `这` → `cái này/là cái này/giá/này/vậy/đây` | `這` → `này` |

This happened because the source dictionaries themselves mix scripts
(different community tools targeted different novel sites), and
`build_dictionary.py` never runs an OpenCC normalization pass across the
merged `words`/`names`/`pronouns` data — `opencc` is only used internally
for the `hanviet_fallback` character table, which does explicitly
generate both simplified and traditional keys from each traditional
source row.

**Practical consequence:** coverage and translation richness for a given
phrase can differ depending on which script the input chapter happens to
use, since the two forms are independent entries, not aliases of each
other. This is very likely fine most of the time (both forms are present
for common vocabulary, as shown above), but isn't guaranteed for less
common phrases, and it's a bug waiting to be "discovered" once a scraper
hits a site that mixes scripts within one chapter.

**Not fixed yet, intentionally** — this needs a decision, not just a
patch: either (a) normalize the whole dictionary to one script at build
time and convert incoming chapter text to match before tokenizing, or
(b) do a live dual-lookup (try the phrase as-is, then its OpenCC-converted
form) at query time. (a) is simpler and faster; (b) preserves whatever
extra nuance exists in same-meaning-different-script entries. Revisit
when the tokenizer is actually built.

## Grammar-reorder rules (`rule.txt` DSL) — phase 2, not yet implemented

Chinese and Vietnamese order dates, durations, and quantities differently
(`2006年08月24日` needs to become `ngày 24 tháng 08 năm 2006`, not a
token-by-token substitution). Plain phrase substitution can't do this —
it's why `data/reference/grammar-rules.rule.txt` (675 rules, from
script-vietphrase-translator) was kept as a reference source instead of
merged into the phrase tables. Full format detail lives in
`DICTIONARY_SOURCES.md`; the summary:

- Typed placeholders: `<n>` (numeral run), `<y>` (digit-by-digit number),
  `<L>` (chapter-label word, e.g. 章/卷/回 → generates "Chương"/"Hồi"/...),
  `<ne>`/`<pn>`/`<vp>`/`<hv>` (a match against the Name/Pronoun/Word/
  Han-Viet tables respectively), `<w>` as shorthand for name-or-pronoun-
  or-word.
- `:min-max` bounds a token's character count; `(a|b)` alternation groups;
  `{0}`, `{1}`, ... back-reference captured tokens by appearance order,
  letting a rule reorder them (Chinese day-month-year → Vietnamese
  day-month-year requires exactly this).
- Two older, simpler ancestors (`luatnhan-*.txt`, bare `{0}` placeholders,
  no typed tokens) are kept for reference only — superseded by the format
  above.

**Not implemented.** The recommended approach (from `DICTIONARY_SOURCES.md`)
is to write an interpreter for this exact rule format rather than invent a
new one, since 675 already-battle-tested rules come free with it. Where
this pass sits in the pipeline (step [2] above, before longest-match
tokenization) is decided; the interpreter itself is not written.

## Per-novel name resolution

**Revised 2026-09-05** (see `docs/ARCHITECTURE.md` "Data split: bulk
dictionary stays in SQLite; Postgres holds live app state only" for the
full reasoning): global and per-novel names are no longer two scopes of
the same table. They're two different tables in two different databases:

- **Global names** live in `data/seed/dictionary_seed.db`'s `names`
  table (SQLite) — the bulk, rebuilt-from-source dictionary, ~276k rows,
  all effectively global (its own `novel_id` column and partial unique
  index are a SQLite-seed-internal detail; see `docs/DICTIONARY_SOURCES.md`
  "Schema v3" — this table's design didn't change).
- **Per-novel overrides** live in Postgres's `Name` model
  (`prisma/schema.prisma`) — starts empty for every novel, grows only as
  a user actually curates one, `novelId` required on every row (there is
  no "global" row in this table at all anymore).

Resolution order for a Name lookup: check the current novel's Postgres
overrides first, fall back to the SQLite global table if the current
novel has no override for that phrase. This means a user adding
"萧炎 → Viêm Nhi" as a per-novel nickname override for one story doesn't
affect the global "萧炎 → Tiêu Viêm" used everywhere else. Not
implemented yet — this is a statement of intended behavior for whoever
writes the lookup service; see `docs/ARCHITECTURE.md`'s "Data split"
section for the concrete shape (fetch all of a novel's overrides in one
query per chapter translation, not one query per substring).

## scrape_blacklist

274 line/paragraph patterns (site ads, "to be continued" banners, forum
footers) — applied as a raw substring filter against scraped chapter text
**before** it reaches the tokenizer at all. Not a translation dictionary;
never participates in lookup. Not wired into a scraper yet, since no
scraper exists.

## Open decisions, collected

Repeating these here so they're easy to find in one place, rather than
buried in prose above:

1. Longest-match wins over category priority at differing lengths;
   category priority (name > pronoun > word) only breaks same-length
   ties. (Decided, validated against the prototype, documented, not yet
   in production code.)
2. Practical tokenizer scan window (full 42-char range vs. a capped
   window like 12-16 chars). Not decided.
3. Which alternate translation to emit by default when an entry has
   several `/`-separated options. Not decided (take-first is the current
   prototype's placeholder, and reads fine in the validation run, but
   wasn't chosen deliberately).
4. Simplified/Traditional normalization strategy — build-time dictionary
   normalization vs. query-time dual lookup. Not decided.
5. Where exactly the "future readability pass" (step [4]) starts once
   grammar-rule reordering is implemented — not scoped at all yet.
6. ~~Cleaning the numeral/date-junk rows out of `words`~~ — **done**,
   see "Confirmed data-quality issue" above (17,280 -> 321 rows).
7. Punctuation mapping (full-width Chinese punctuation -> Vietnamese
   equivalents) — not designed, not implemented.
