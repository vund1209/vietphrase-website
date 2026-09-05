import Link from "next/link";
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
}

export function NovelCard({ slug, title, author, coverImageUrl, chapterCount, canDelete }: NovelCardProps) {
  return (
    <div className="relative flex flex-col gap-2">
      <Link href={`/novels/${slug}`} className="flex flex-col gap-2">
        <div className="aspect-[2/3] overflow-hidden rounded-md bg-neutral-200 dark:bg-neutral-800">
          {coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary hotlinked third-party hosts, not in next.config's image allowlist
            <img src={coverImageUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="line-clamp-2 text-sm font-medium">{title}</div>
        <div className="text-xs text-neutral-500">
          {author ? `${author} · ` : ""}
          {chapterCount} chương
        </div>
      </Link>
      {canDelete && (
        <div className="absolute top-1 right-1 rounded-md bg-white/90 backdrop-blur-sm dark:bg-neutral-900/90">
          <DeleteNovelButton novelSlug={slug} novelTitle={title} />
        </div>
      )}
    </div>
  );
}
