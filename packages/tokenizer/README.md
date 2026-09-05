# @vietphrase/tokenizer

The production longest-match tokenizer, implementing the algorithm
specified in `docs/VIETPHRASE_CORE.md`. Promoted from `prototype/tokenizer.mjs`
after that prototype found and fixed two real bugs against real data (see
`VIETPHRASE_CORE.md` "Validation" for that history) — this module is the
one to import going forward, the prototype stays only as a historical
record of that validation run.

## Status

Bulk dictionary data source (names/pronouns/words/hanviet_fallback): a
`dictionary_seed.db`-shaped SQLite file, read directly via Node's
built-in (experimental) `node:sqlite`. This is the permanent design, not
an interim one — see `docs/ARCHITECTURE.md` "Data split" for why that
~226 MB of static, rebuilt-from-source data stays in SQLite rather than
Postgres. This module never talks to Postgres/Prisma itself.

Per-novel Name overrides (the one thing that *is* live, mutable app
data) live in Postgres's `Name` table and are the caller's
responsibility to fetch and pass in as the `overrides` map on each
`tokenize()` call — see "Usage" below.

Wired into the Next.js app's `/api/translate` route (no novel context —
global resolution only). The reading library, which would supply
per-novel `overrides`, doesn't exist yet.

No npm dependencies. Requires Node >= 22 (uses `node:sqlite` and
`node:test`, both built in).

## Usage

```js
import { VietPhraseTokenizer } from "@vietphrase/tokenizer";

const tok = new VietPhraseTokenizer("../../data/seed/dictionary_seed.db");
const tokens = tok.tokenize("萧炎缓缓睁开双眼");
// [{ source: "name", chinese: "萧炎", vietnamese: "Tiêu Viêm", ... }, ...]

// Per-novel name override, falls back to the global name if the novel
// has no override for that phrase. Fetch these from Postgres's `Name`
// table once per chapter translation (not per substring), build a Map,
// and pass it in -- see docs/ARCHITECTURE.md "Data split":
const overrides = new Map([["萧炎", "Viêm Nhi"]]);
tok.tokenize("萧炎", { overrides }); // -> "Viêm Nhi"
tok.tokenize("萧炎"); // no overrides -> falls back to global "Tiêu Viêm"

tok.close();
```

## Testing

```
npm test
```

Runs on Node's built-in test runner (`node --test`, no dependencies).
`test/tokenizer.test.mjs` is isolated unit tests against a small
synthetic database (fast, deterministic, independent of the real
dataset). `test/tokenizer.real-data.test.mjs` is a handful of regression
spot-checks against the real `dictionary_seed.db`, guarding against the
specific bugs this module was built to fix reappearing in a future data
rebuild.

## What this does NOT do yet

See `docs/VIETPHRASE_CORE.md` "Open decisions" for the full list — most
relevantly: no grammar-reorder pass (dates/numbers won't read naturally
yet), no punctuation mapping, no Simplified/Traditional normalization,
and the scan window / alternate-translation defaults are placeholders,
not considered choices.
