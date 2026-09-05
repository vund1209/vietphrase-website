import { getOrTranslateChapter, ChapterNotFoundError, ScrapeFailedError } from "@/lib/novels";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; number: string }> }
): Promise<Response> {
  const { slug, number } = await params;
  const chapterNumber = Number(number);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    return Response.json({ error: "Invalid chapter number" }, { status: 400 });
  }

  try {
    const result = await getOrTranslateChapter(slug, chapterNumber);
    return Response.json(result);
  } catch (err) {
    if (err instanceof ChapterNotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof ScrapeFailedError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }
}
