import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Any logged-in reader may add an existing preset Tag to any novel --
// low risk since tagId must reference a real, curated Tag row (see
// prisma/schema.prisma's Tag model): there's no way to invent an
// arbitrary tag through this endpoint. See the planning doc's section 13.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const { slug } = await params;
  const body = await request.json().catch(() => null);
  const tagId = Number(body?.tagId);
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return Response.json({ error: "tagId is required" }, { status: 400 });
  }

  const [novel, tag] = await Promise.all([
    prisma.novel.findUnique({ where: { slug }, select: { id: true } }),
    prisma.tag.findUnique({ where: { id: tagId } }),
  ]);
  if (!novel) return Response.json({ error: "Novel not found" }, { status: 404 });
  if (!tag) return Response.json({ error: "Tag not found" }, { status: 404 });

  const userId = Number(session.user.id);
  const novelTag = await prisma.novelTag.upsert({
    where: { novelId_tagId: { novelId: novel.id, tagId } },
    create: { novelId: novel.id, tagId, addedByUserId: userId },
    // Already tagged -- idempotent, leave the original attribution alone.
    update: {},
    include: { tag: true },
  });

  return Response.json({ novelTag }, { status: 201 });
}
