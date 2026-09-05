import { prisma } from "@/lib/prisma";
import { fetchChapterList, extractSourceChapterId } from "@/lib/scraper";
import { slugFromSourceUrl, withSuffix } from "@/lib/slug";
import { translateText } from "@/lib/tokenizer";

export interface NovelSummary {
  slug: string;
  title: string;
  author: string | null;
  coverImageUrl: string | null;
  sourceUrl: string | null;
  status: string;
  chapterCount: number;
  createdAt: string;
}

export async function GET(): Promise<Response> {
  const novels = await prisma.novel.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { chapters: true } } },
  });

  const body: NovelSummary[] = novels.map((n) => ({
    slug: n.slug,
    title: n.title,
    author: n.author,
    coverImageUrl: n.coverImageUrl,
    sourceUrl: n.sourceUrl,
    status: n.status,
    chapterCount: n._count.chapters,
    createdAt: n.createdAt.toISOString(),
  }));

  return Response.json({ novels: body });
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  if (!url) {
    return Response.json({ error: "url is required" }, { status: 400 });
  }
  try {
    new URL(url);
  } catch {
    return Response.json({ error: "url is not a valid URL" }, { status: 400 });
  }

  // Idempotent: adding the same book URL twice returns the existing
  // novel rather than creating a duplicate.
  const existing = await prisma.novel.findFirst({ where: { sourceUrl: url } });
  if (existing) {
    return Response.json({ novel: existing, alreadyExists: true });
  }

  let fetched;
  try {
    fetched = await fetchChapterList(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch chapter list";
    return Response.json({ error: message }, { status: 422 });
  }

  const originalTitle =
    fetched.bookTitle?.trim() || `Truyện chưa đặt tên (${new URL(url).hostname})`;
  const title = translateText(originalTitle);
  const baseSlug = slugFromSourceUrl(url);

  // `data/seed/dictionary_seed.db` reasoning aside, this is a small
  // table (one row per novel) -- a loop-until-free slug check is fine.
  let slug = baseSlug;
  for (let attempt = 0; await prisma.novel.findUnique({ where: { slug } }); attempt++) {
    slug = withSuffix(baseSlug, attempt + 1);
  }

  const novel = await prisma.novel.create({
    data: {
      slug,
      title,
      originalTitle,
      description: fetched.description,
      coverImageUrl: fetched.coverImageUrl,
      author: fetched.author,
      sourceUrl: url,
      status: "READY",
      chapters: {
        createMany: {
          data: fetched.chapters.map((c, i) => ({
            chapterNumber: i + 1,
            title: translateText(c.title),
            originalTitle: c.title,
            sourceChapterId: extractSourceChapterId(c.url),
            sourceUrl: c.url,
            status: "PENDING",
          })),
        },
      },
    },
    include: { _count: { select: { chapters: true } } },
  });

  return Response.json({ novel, chapterCount: novel._count.chapters }, { status: 201 });
}
