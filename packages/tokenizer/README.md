# @vietphrase/tokenizer

The production longest-match tokenizer, implementing the algorithm
specified in `docs/VIETPHRASE_CORE.md`. Promoted from `prototype/tokenizer.mjs`
after that prototype found and fixed two real bugs against real data (see
`VIETPHRASE_CORE.md` "Validation" for that history) — this module is the
one to import going forward, the prototype stays only as a historical
record of that validation run.

## Status

Interim data source: reads a `dictionary_seed.db`-shaped SQLite file
directly via Node's built-in (experimental) `node:sqlite`. Once the live
app has a Postgres database (`prisma/schema.prisma`), the lookup
statements should move to Prisma queries — the public `tokenize()`
contract (input text + optional `novelId` in, an array of `Token` out) is
intended to survive that swap unchanged.

Not yet wired into any app — no Next.js project exists yet. This is a
standalone, dependency-free package so it can be developed and tested in
isolation before that decision is made.

No npm dependencies. Requires Node >= 22 (uses `node:sqlite` and
`node:test`, both built in).

## Usage

```js
import { VietPhraseTokenizer } from "@vietphrase/tokenizer";

const tok = new VietPhraseTokenizer("../../data/seed/dictionary_seed.db");
const tokens = tok.tokenize("萧炎缓缓睁开双眼");
// [{ source: "name", chinese: "萧炎", vietnamese: "Tiêu Viêm", ... }, ...]

// Per-novel name override, falls back to the global name if the novel
// has no override for that phrase:
tok.tokenize("萧炎", { novelId: 42 });

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
