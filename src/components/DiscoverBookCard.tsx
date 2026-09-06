// Server-renderable card for a Discover-mode book-list entry (not a real
// Novel row -- see src/lib/extract/types.ts's DiscoverBookListItem).
// Visually mirrors NovelCard's cover-forward treatment so Discover mode
// and the real library grid feel like the same product. Two distinct
// actions, since "view" and "embed" are genuinely different intents (see
// the planning doc's section 14): the cover/title opens the book in
// Browse mode -- live fetch + translate, nothing saved, and htmlProxy.ts
// already rewrites the book's own same-site links (TOC, chapters,
// pagination) to stay inside that proxy, so a reader can keep clicking
// through and actually read chapters without ever embedding anything.
// EmbedDiscoverBookButton is the separate, explicit "add to my library
// permanently" action. A small external-link icon covers the reader who
// wants the raw, untranslated source page instead of either.
import Link from "next/link";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import type { DiscoverBookListItem } from "@/lib/extract/types";
import { EmbedDiscoverBookButton } from "./EmbedDiscoverBookButton";

interface DiscoverBookCardProps {
  book: DiscoverBookListItem;
  isSignedIn: boolean;
}

export function DiscoverBookCard({ book, isSignedIn }: DiscoverBookCardProps) {
  const browseHref = `/surf/browse?url=${encodeURIComponent(book.url)}`;
  return (
    <div className="group flex flex-col gap-2">
      <Link
        href={browseHref}
        className="flex flex-col gap-2 rounded-lg motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:-translate-y-0.5"
      >
        <div className="aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-accent/15 transition-shadow group-hover:shadow-lg group-hover:shadow-accent/20 group-hover:ring-accent/40">
          {book.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- hotlinked source-site cover, not in next.config's image allowlist
            <img src={book.coverImageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="line-clamp-2 text-sm font-medium">{book.title}</div>
      </Link>
      <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
        <span className="truncate">{book.author ?? "Không rõ tác giả"}</span>
        <a
          href={book.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title="Xem trang gốc"
          className="shrink-0 hover:text-foreground"
        >
          <ArrowSquareOut size={13} />
        </a>
      </div>
      <EmbedDiscoverBookButton url={book.url} isSignedIn={isSignedIn} />
    </div>
  );
}
