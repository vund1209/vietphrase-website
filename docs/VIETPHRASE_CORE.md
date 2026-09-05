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
   1. `names` scoped to the current novel (`novel_id = <this novel>`)
   2. `names` global fallback (`novel_id = <the reserved "global" row>`)
   3. `words`
   4. `pronouns`
2. The first hit — at the *longest* length any of the four sources match —
   wins. Category priority (name > word > pronoun) only breaks ties
   *within* the same match length; a longer `words` match beats a shorter
   `names` match at the same position. This is the standard behavior in
   the QuickTranslator-family tools these dictionaries came from (see
   `DICTIONARY_SOURCES.md`), carried over here as the default — flagged
   explicitly since it's a real design choice, not an obvious one.
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

`names.novel_id` scopes an entry to one novel (see `docs/DICTIONARY_SOURCES.md`
"Schema v3" and `prisma/schema.prisma`). Resolution order for a Name lookup
is: try the current novel's scope first, fall back to the reserved "global"
Novel row if the current novel has no override for that phrase. This means
a user adding "萧炎 → Viêm Nhi" as a per-novel nickname override for one
story doesn't affect the global "萧炎 → Tiêu Viêm" used everywhere else.
Not implemented — this is a statement of intended behavior for whoever
writes the lookup service.

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
   category priority only breaks same-length ties. (Decided, documented,
   not implemented.)
2. Practical tokenizer scan window (full 42-char range vs. a capped
   window like 12-16 chars). Not decided.
3. Which alternate translation to emit by default when an entry has
   several `/`-separated options. Not decided (take-first is the likely
   placeholder).
4. Simplified/Traditional normalization strategy — build-time dictionary
   normalization vs. query-time dual lookup. Not decided.
5. Where exactly the "future readability pass" (step [4]) starts once
   grammar-rule reordering is implemented — not scoped at all yet.
