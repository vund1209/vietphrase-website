# Development environment

This project runs on the user's Windows machine. Exact versions recorded
here on 2026-09-05, per explicit request, so tooling and dependency
choices never silently drift out of compatibility with what's actually
installed:

| Tool | Version |
|---|---|
| Python | 3.14.7 |
| Node.js | 26.8.1 |
| npm | 12.0.2 |

Pinned in `.nvmrc` and `.python-version` at the repo root so version-
manager tools (nvm, fnm, pyenv, volta, etc.) that read those files pick
the right version automatically.

## Important caveat: most of this repo so far was built/tested on DIFFERENT versions

Claude does not have terminal access to the Windows machine directly --
commands run through a bridged Linux environment instead. Everything done
in this repo up to now (`data/seed/build_dictionary.py`,
`data/seed/migrate_split_schema.py`, `packages/tokenizer` and its test
suite, `prototype/tokenizer.mjs`) actually ran on that Linux environment's
versions, not the Windows versions above:

| Tool | Version actually used so far |
|---|---|
| Python | 3.10.12 |
| Node.js | 22.23.2 |
| npm | 10.9.8 (hit an unrelated internal bug on any install attempt: `Cannot read properties of null (reading 'edgesOut')`) |

This matters most for `packages/tokenizer`, which is built entirely on
Node's built-in `node:sqlite` module -- explicitly marked **experimental**
as of Node 22, meaning its API is allowed to change between major
versions without the usual stability guarantees. It has NOT been run on
Node 26.8.1 as of this writing.

**Before trusting `packages/tokenizer` for real, run its test suite on
the actual Windows machine:**

```
cd packages/tokenizer
npm test
```

All 10 tests should pass, unchanged. If `node:sqlite`'s API shifted
between Node 22 and Node 26, this is where it would surface first --
either as a hard error (best case, obvious) or as a subtle behavior
change (worse case, silent). Report back what happens; don't assume it's
fine just because it worked here.

Smaller, unverified risk: `build_dictionary.py`'s one third-party
dependency, `opencc-python-reimplemented`, hasn't been checked against
Python 3.14. This only matters when rebuilding the dictionary from
scratch (see `docs/DICTIONARY_SOURCES.md`), not for normal use of the
already-built `dictionary_seed.db`.

The npm 10.9.8 bug above may simply not exist on the real machine's
12.0.2 -- npm itself suggested that exact upgrade when this was hit, and
this machine already has it. Worth confirming with a normal `npm install`
somewhere, but not expected to be a real problem.
