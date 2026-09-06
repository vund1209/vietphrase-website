# Contributing

Thanks for considering a contribution to VietPhrase.

## Adding support for a new Chinese novel site

This is the most common contribution and has its own dedicated guide:
see **[docs/ADDING_A_SITE.md](docs/ADDING_A_SITE.md)**. In short: one new
file under `src/lib/sites/`, one line in `src/lib/sites/registry.ts`,
one test file -- no other file needs to change.

## Other changes

- Read `docs/ARCHITECTURE.md` first for the app's overall design and
  the reasoning behind existing decisions.
- Before opening a PR, run:
  ```bash
  npx tsc --noEmit -p .
  npx eslint src
  npm test
  npx next build
  ```
- Keep changes scoped -- a bug fix shouldn't bundle an unrelated
  refactor, and a new feature shouldn't restructure code it doesn't
  need to touch.
- Never commit real scraped novel content (Chinese source text or its
  translation) in test fixtures -- use short placeholder strings that
  match a site's real HTML *structure*, not its real prose.
