// Returns every "continue reading" position the signed-in user has,
// across every novel -- powers ClientSyncBoundary.tsx's once-per-login
// sync into IndexedDB (see src/lib/clientSync.ts). Keyed by novel *slug*
// in the response, matching the client store's key.
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const rows = await prisma.readingProgress.findMany({
    where: { userId },
    select: {
      chapterNumber: true,
      updatedAt: true,
      novel: { select: { slug: true, title: true } },
    },
  });

  return Response.json({
    progress: rows.map((r) => ({
      novelSlug: r.novel.slug,
      novelTitle: r.novel.title,
      chapterNumber: r.chapterNumber,
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}
