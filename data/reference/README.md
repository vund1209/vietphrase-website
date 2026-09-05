# Phase-2 reference data

Not wired into `dictionary_seed.db` yet — kept here because they're small
enough to bundle directly rather than requiring a full clone of their source
repos. See `docs/DICTIONARY_SOURCES.md` ("Kept as reference only" section)
for full context on each.

| File | Source | Use it for |
|---|---|---|
| `grammar-rules.rule.txt` | script-vietphrase-translator | **Priority phase-2 build**: a typed template DSL (`<n>`, `<y>`, `<L>`, `<ne>`, `<pn>`, `<vp>`, `<hv>` tokens) for grammar-reorder rules — dates, durations, time ranges. Implement an interpreter for this format for your readability layer. |
| `luatnhan-tiendich.txt`, `luatnhan-hoangtuantk.txt` | TienDich / hoangtuantk | Older, simpler ancestor of the same idea (bare `{0}` placeholders, no typed tokens). Reference/comparison only — superseded by `grammar-rules.rule.txt`. |
| `lacviet-dictionary.txt` | TienDich (LacViet MTD data) | Rich multi-sense Chinese-Vietnamese dictionary with pinyin + numbered definitions. Format: `字=✚[pinyin] Hán Việt: X\n\t1. sense one\n\t2. sense two`. Source for a future "detailed lookup" panel. |
| `thieuchuu-dictionary.txt` | TienDich (classical Thiều Chửu dictionary) | Single-character classical dictionary, numbered senses + usage examples. Same future use as LacViet above, single-char only. |
| `blacklist-tiendich-raw.txt`, `blacklist-hoangtuantk-raw.txt` | TienDich / hoangtuantk | Raw source for the `scrape_blacklist` table already merged into `dictionary_seed.db` — kept here too in case you want to review/extend the patterns directly. |
