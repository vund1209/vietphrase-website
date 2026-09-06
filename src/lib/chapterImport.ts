// Shared logic between the two "add chapters to a USER_CREATED novel"
// import routes -- upload a .txt file
// (src/app/api/novels/[slug]/chapters/import/route.ts) or paste a
// supported URL (.../import-url/route.ts, src/lib/importSources) -- so
// both stay thin wrappers around the same authorization and decode/
// chunk/persist pipeline instead of duplicating it. See the planning
// doc's section 8 for why USER_CREATED novels use ownership (not role)
// authorization.
import { prisma } from "@/lib/prisma";
import { isOwnerOrAdmin } from "@/lib/isOwnerOrAdmin";
import { stripDangerousMarkup } from "@/lib/sanitizeText";
import { decodeTextFile } from "@/lib/textEncoding";
import { detectSourceLanguage, chunkNovelText } from "@/lib/chapterChunking";

// Same inline shape isOwnerOrAdmin.ts itself expects -- avoids pulling
// next-auth's Session type in just for this, matching that module's own
// "keep this dependency-light" reasoning.
type MinimalSession = { user?: { id?: string; role?: unknown } } | null;

export type ChapterImportAuthResult =
  | { ok: true; novel: { id: number; origin: string; addedByUserId: number | null } }
  | { ok: false; status: number; error: string };

export async function authorizeChapterImport(
  slug: string,
  session: MinimalSession
): Promise<ChapterImportAuthResult> {
  if (!session?.user) {
    return { ok: false, status: 401, error: "Sign in required" };
  }

  const novel = await prisma.novel.findUnique({
    where: { slug },
    select: { id: true, origin: true, addedByUserId: true },
  });
  if (!novel) {
    return { ok: false, status: 404, error: "Novel not found" };
  }
  if (novel.origin !== "USER_CREATED") {
    return { ok: false, status: 400, error: "Only user-created novels can import chapters this way" };
  }
  if (!isOwnerOrAdmin(novel, session)) {
    return { ok: false, status: 403, error: "Not the owner of this novel" };
  }

  return { ok: true, novel };
}

export type PersistImportResult =
  | { ok: true; added: number; encoding: string }
  | { ok: false; status: number; error: string };

export async function persistImportedChapters(
  novelId: number,
  buffer: ArrayBuffer
): Promise<PersistImportResult> {
  const { text, encoding } = decodeTextFile(buffer);
  const parsedChapters = chunkNovelText(text);
  if (parsedChapters.length === 0) {
    return { ok: false, status: 422, error: "Could not find any chapter content in this file" };
  }

  const last = await prisma.chapter.findFirst({
    where: { novelId },
    orderBy: { chapterNumber: "desc" },
    select: { chapterNumber: true },
  });
  const nextNumber = (last?.chapterNumber ?? 0) + 1;

  await prisma.chapter.createMany({
    data: parsedChapters.map((c, i) => {
      const rawText = stripDangerousMarkup(c.rawText);
      const title = stripDangerousMarkup(c.title);
      return {
        novelId,
        chapterNumber: nextNumber + i,
        title,
        originalTitle: title,
        rawText,
        sourceLanguage: detectSourceLanguage(rawText),
        status: "SCRAPED" as const,
        scrapedAt: new Date(),
      };
    }),
  });

  return { ok: true, added: parsedChapters.length, encoding };
}
