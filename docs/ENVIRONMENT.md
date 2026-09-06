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
suite, `prototype/tokenizer.mjs`, the Next.js app scaffold) actually ran
on that Linux environment's versions, not the Windows versions above:

| Tool | Version actually used so far |
|---|---|
| Python | 3.10.12 |
| Node.js | 22.23.2 |
| npm | 10.9.8 (hit an unrelated internal bug on any install attempt: `Cannot read properties of null (reading 'edgesOut')`) |

This mattered most for `packages/tokenizer`, which is built entirely on
Node's built-in `node:sqlite` module -- explicitly marked **experimental**
as of Node 22, meaning its API is allowed to change between major
versions without the usual stability guarantees.

**Confirmed 2026-09-05**: `npm test` run on the real Windows machine
(Node 26.8.1) -- all 10 tests pass, unchanged, same as on the bridged
Linux environment's Node 22.23.2. `node:sqlite`'s API did not shift in a
way that affects this module between those two versions.

Smaller, unverified risk: `build_dictionary.py`'s one third-party
dependency, `opencc-python-reimplemented`, hasn't been checked against
Python 3.14. This only matters when rebuilding the dictionary from
scratch (see `docs/DICTIONARY_SOURCES.md`), not for normal use of the
already-built `dictionary_seed.db`.

## npm bug: installing `prisma` crashes this bridge's npm 10.9.8

`npm install prisma` (and even `npm cache clean --force`) reliably threw
`Cannot read properties of null (reading 'edgesOut')` -- an npm arborist
internal error. Confirmed this is specific to `prisma`'s peer-dependency
graph, not a general npm breakage (`npm install lodash`, `npm install
next react react-dom` all worked fine on the same npm). Fixed with
`npm install prisma --legacy-peer-deps`, made permanent project-wide via
the root `.npmrc` (`legacy-peer-deps=true`, already committed) so no one
has to remember the flag. This npm 10.9.8 bug may simply not exist on the
real machine's npm 12.0.2 -- worth confirming with a normal `npm install`
there, but not expected to be a real problem, and the `.npmrc` fix is
harmless either way.

## Sandbox limitation: `prisma validate`/`generate` cannot run in this bridged environment

Prisma's CLI needs to download its query/schema engine binaries from
`binaries.prisma.sh` on first use. That domain returns `403` through this
bridge's proxy (confirmed directly with `curl`, not just through the
Prisma CLI) -- it's not in the sandbox's allowed domain list, and this
isn't something fixable from within this session.

Practical effect: `prisma/schema.prisma` has only been reviewed by eye
for syntax so far -- **`npx prisma validate`, `npx prisma generate`, and
`npx prisma migrate dev` are all unverified**. Once a real `DATABASE_URL`
is available (see the root `.env.example`), please run these on the real
Windows machine, which has normal internet access:

```
npx prisma validate
npx prisma generate
npx prisma migrate dev --name init
```

If any of these surface a schema mistake, that's expected -- report it
back so the schema can be fixed; it just couldn't be caught earlier here.

## Other environment notes

- Google Fonts (`fonts.googleapis.com`) is also unreachable from this
  bridge -- `next dev` logs a warning and falls back to a system font.
  Not a real bug, just another sandbox network gap; expected to work
  normally on the real machine.
- **Resolved (2026-09-06)**: the 3 high-severity `deepmerge-ts` advisories
  (via `@prisma/config` via `prisma`) are fixed -- a plain `npm audit fix`
  (no `--force`, no major-version jump) resolved them within the existing
  `^6` range by settling on `prisma`/`@prisma/engines`/`@prisma/config` at
  `6.12.0`, a version before `@prisma/config` started depending on
  `deepmerge-ts` at all. `@prisma/client` is pinned to the same `6.12.0`
  (exact, not `^6`) to keep the CLI and generated client in lockstep --
  Prisma's own guidance is to never let these drift apart. Confirmed
  `npx prisma generate`, `tsc`, `eslint`, `npm test`, and `next build` all
  still pass at this pinned version. Revisit the pin once Prisma ships a
  patched `@prisma/config` upstream (check via `npm view @prisma/config@latest dependencies`
  for a non-vulnerable `deepmerge-ts` before unpinning either package).
