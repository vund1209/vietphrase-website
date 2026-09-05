// Admin-only: re-derives a novel's title/description/author/cover from its
// source URL and overwrites the stored values. Needed because metadata
// extraction has evolved (e.g. a site adapter added after a book was
// already embedded, see src/lib/extract/adapters.ts's getBookMeta) --
// unlike chapter re-fetch (src/app/api/novels/[slug]/chapters/[number]/refetch/route.ts),
// there's no lazy "null triggers a re-scrape" path for book-level
// metadata, so this re-fetches eagerly instead of just clearing a cache.
import { auth, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchBookMeta } from "@/lib/scraper";
import { translateText } from "@/lib/tokenizer";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return Response.json({ error: "Admin role required" }, { status: 403 });
  }

  const { slug } = await params;
  const novel = await prisma.novel.findUnique({ where: { slug }, select: { id: true, sourceUrl: true } });
  if (!novel) {
    return Response.json({ error: "Novel not found" }, { status: 404 });
  }
  if (!novel.sourceUrl) {
    return Response.json({ error: "Novel has no source URL to re-fetch from" }, { status: 400 });
  }

  let meta;
  try {
    meta = await fetchBookMeta(novel.sourceUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch metadata";
    return Response.json({ error: message }, { status: 422 });
  }

  const updated = await prisma.novel.update({
    where: { id: novel.id },
    data: {
      title: meta.title ? translateText(meta.title) : undefined,
      originalTitle: meta.title ?? undefined,
      description: meta.description ? translateText(meta.description) : null,
      originalDescription: meta.description ?? null,
      author: meta.author ?? undefined,
      coverImageUrl: meta.coverImageUrl ?? undefined,
    },
  });

  return Response.json({ novel: updated });
}
