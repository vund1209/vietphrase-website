import Link from "next/link";
import { Eye } from "@phosphor-icons/react/dist/ssr";
import { DeleteNovelButton } from "./DeleteNovelButton";

// Shared book-cover-forward card for the library grid and search results,
// so both look identical. Server-renderable (no "use client") -- only
// DeleteNovelButton underneath needs interactivity.
interface NovelCardProps {
  slug: string;
  title: string;
  author: string | null;
  coverImageUrl: string | null;
  chapterCount: number;
  canDelete: boolean;
  /** Overrides the default `/novels/${slug}` link target -- e.g. straight to an in-progress chapter. */
  href?: string;
  /** Overrides the default "author · N chương" line -- e.g. "Chương 3" for a continue-reading card. */
  subtitle?: string;
  description?: string | null;
  /**
   * Real, incrementally-tracked chapter-view count (see
   * prisma/schema.prisma's Novel.viewCount) -- optional so a card that
   * doesn't have this data yet (or isn't a real Novel row, e.g. a future
   * discover/browse result) can just omit the badge instead of showing a
   * fabricated 0. See the planning doc's section 12.
   */
  viewCount?: number;
}

export function NovelCard({
  slug,
  title,
  author,
  coverImageUrl,
  chapterCount,
  canDelete,
  href,
  subtitle,
  description,
  viewCount,
}: NovelCardProps) {
  return (
    <div className="group relative flex flex-col gap-2">
      <Link
        href={href ?? `/novels/${slug}`}
        className="flex flex-col gap-2 rounded-lg motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:active:scale-[0.98]"
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-accent/15 transition-shadow group-hover:shadow-lg group-hover:shadow-accent/20 group-hover:ring-accent/40">
          {coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary hotlinked third-party hosts, not in next.config's image allowlist
            <img
              src={coverImageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : null}
          {typeof viewCount === "number" && viewCount > 0 && (
            <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              <Eye size={11} weight="fill" />
              {viewCount >= 1000 ? `${(viewCount / 1000).toFixed(1)}k` : viewCount}
            </span>
          )}
        </div>
        <div className="line-clamp-2 text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">
          {subtitle ?? `${author ? `${author} · ` : ""}${chapterCount} chương`}
        </div>
        {description && (
          <div className="line-clamp-3 text-xs text-muted-foreground">{description}</div>
        )}
      </Link>
      {canDelete && (
        <div className="absolute top-1 right-1 rounded-md bg-card/90 backdrop-blur-sm">
          <DeleteNovelButton novelSlug={slug} novelTitle={title} />
        </div>
      )}
    </div>
  );
}
