# Adding support for a new Chinese novel site

Every supported site lives as one self-contained file under
`src/lib/sites/`, registered in one place. This is the entire
contribution surface for site support -- no other file needs to change.

## 1. Try the generic extractor first

Before writing any site-specific code, try a real book/chapter URL from
the new site through the app as-is (`npm run dev`, add the book via the
home page's add-by-URL form). `src/lib/extract/chapterList.ts` and
`chapterContent.ts` are generic, heuristic extractors (densest-cluster
link detection for chapter lists, CJK-character-density detection for
chapter body text) that already work on many sites with zero
site-specific code. Only add a per-site file once the generic extractor
demonstrably fails on a real page from that site -- see
`docs/ARCHITECTURE.md`'s "Scraping strategy" section for why.

## 2. Create `src/lib/sites/<id>.ts`

Copy an existing file as a template -- `src/lib/sites/sfacg.ts` and
`shuba.ts` both have Discover-mode support (a good template if the new
site has a public browse/rank list); `fanqie.ts` is a good template for
chapter-list/content support only, no Discover mode.

Export a single object matching `SiteDefinition` (`src/lib/sites/types.ts`):

```ts
export interface SiteDefinition {
  id: string;                 // stable slug, e.g. "sfacg" -- used in /surf/discover/[source] URLs
  displayName: string;        // shown in Discover mode's source picker
  matches(url: string): boolean;
  getChapterList(html: string, pageUrl: string): ChapterListItem[];
  getChapterContent(html: string, pageUrl: string): ExtractedChapterContent;
  getBookMeta?(html: string, pageUrl: string): BookMeta;          // optional
  discover?: {                                                    // optional
    hostname: string;
    buildListUrl(page: number, sort: DiscoverSort): string;
    getBookList(html: string, pageUrl: string): DiscoverBookListItem[];
  };
}
```

- `matches`: does this URL belong to the new site (any page on it --
  book landing, chapter, list)? Usually just a hostname check.
- `getChapterList` / `getChapterContent`: only override what the
  generic extractor actually gets wrong on this site. It's common for
  one to need overriding and not the other (e.g. `fanqie.ts` only
  overrides chapter-title resolution, reusing the generic extractor for
  everything else via `extractChapterList`/`extractChapterContent`).
- `getBookMeta`: only needed if the site's own `og:title`/`og:description`/
  `meta[name=author]` tags are missing, wrong, or SEO-boilerplate rather
  than the book's real title/synopsis/author.
- `discover`: only add this if the site has a real, parseable public
  browse/rank list page you can build a URL for and extract book entries
  from. If it doesn't (or the list only loads via a signed/token-gated
  API you have no legitimate way to call -- see `fanqie.ts`'s comment
  for a real example), omit `discover` entirely; the site still works
  for the "paste a book URL to embed it" flow, just not the Discover
  mode browsing UI.

Every function takes already-fetched `html` -- these files never do
their own network fetches. If the site is protected by a Cloudflare-style
JS challenge, no code change is needed here at all: `src/lib/scraper.ts`'s
`fetchHtml` already falls back to a real headless-browser render
(`src/lib/browserFetch.ts`) automatically whenever a plain fetch looks
bot-challenged.

## 3. Register it in `src/lib/sites/registry.ts`

Add one import and one array entry:

```ts
import { yourSite } from "./yoursite.ts";
const SITES: SiteDefinition[] = [sfacgSite, fanqieSite, shubaSite, yourSite];
```

That's the whole registration step -- `resolveSite`, `getDiscoverSite`,
and `listDiscoverSites` all read from this one array.

## 4. Write `src/lib/sites/<id>.test.ts`

Use synthetic HTML fixtures trimmed to the real structure you confirmed
by inspecting a live page directly -- never commit a fixture built from
guessed markup. `sfacg.test.ts`, `fanqie.test.ts`, and `shuba.test.ts` are
all good examples of the expected shape (`node:test` + `node:assert/strict`,
no network calls, no real book/chapter text -- placeholder strings only).

Within `src/lib/sites/`, import other project files with a relative path
and an explicit `.ts` extension (e.g. `../extract/chapterContent.ts`),
not the `@/lib/...` alias -- these files run directly under Node's test
runner (`npm test`), which doesn't resolve that alias the way Next.js's
bundler does for `src/app/`/`src/components/` code.

## 5. Verify

```bash
npx tsc --noEmit -p .
npx eslint src
npm test
npx next build
```

Then a real end-to-end check: add a real book URL from the new site
through the running app and confirm a chapter reads correctly; if you
added `discover`, also check `/surf/discover/<id>` lists real books.
