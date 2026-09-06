// Returns every personal override the signed-in user has saved, across
// every novel and both tracks -- powers ClientSyncBoundary.tsx's
// once-per-login sync into IndexedDB (see src/lib/clientSync.ts). Keyed
// by novel *slug* in the response, not novelId, since the client store
// is slug-keyed (see clientSync.ts's file header for why).
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const select = {
    chineseText: true,
    vietnameseText: true,
    capStyle: true,
    updatedAt: true,
    novel: { select: { slug: true } },
  } as const;

  const [wordOverrides, nameOverrides] = await Promise.all([
    prisma.userWordOverride.findMany({ where: { userId }, select }),
    prisma.userNameOverride.findMany({ where: { userId }, select }),
  ]);

  const toRecord = (o: (typeof wordOverrides)[number], track: "phrase" | "name") => ({
    novelSlug: o.novel.slug,
    chineseText: o.chineseText,
    vietnameseText: o.vietnameseText,
    capStyle: o.capStyle,
    track,
    updatedAt: o.updatedAt.toISOString(),
  });

  return Response.json({
    overrides: [
      ...wordOverrides.map((o) => toRecord(o, "phrase")),
      ...nameOverrides.map((o) => toRecord(o, "name")),
    ],
  });
}
