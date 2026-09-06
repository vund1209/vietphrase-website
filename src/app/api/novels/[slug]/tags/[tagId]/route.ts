import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isOwnerOrAdmin } from "@/lib/isOwnerOrAdmin";

// Removing a tag requires being the reader who added it, or an admin --
// prevents griefing (anyone could otherwise strip another reader's
// tagging work). Reuses isOwnerOrAdmin against NovelTag.addedByUserId,
// same shape it already checks against Novel.addedByUserId. See the
// planning doc's section 13.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string; tagId: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const { slug, tagId: tagIdParam } = await params;
  const tagId = Number(tagIdParam);
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return Response.json({ error: "Invalid tagId" }, { status: 400 });
  }

  const novel = await prisma.novel.findUnique({ where: { slug }, select: { id: true } });
  if (!novel) return Response.json({ error: "Novel not found" }, { status: 404 });

  const novelTag = await prisma.novelTag.findUnique({
    where: { novelId_tagId: { novelId: novel.id, tagId } },
  });
  if (!novelTag) return Response.json({ error: "Tag not attached to this novel" }, { status: 404 });

  if (!isOwnerOrAdmin(novelTag, session)) {
    return Response.json({ error: "Not authorized to remove this tag" }, { status: 403 });
  }

  await prisma.novelTag.delete({ where: { id: novelTag.id } });
  return Response.json({ ok: true });
}
