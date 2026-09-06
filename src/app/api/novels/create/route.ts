// Creates a USER_CREATED novel (metadata only, zero chapters) -- the
// "Tạo truyện của bạn" mode of AddBookModal, distinct from
// POST /api/novels (embeds an existing book from a source URL). See the
// planning doc's section 8. addedByUserId here means *ownership*, not
// just attribution (see src/lib/isOwnerOrAdmin.ts) -- content is added
// afterward via POST .../chapters (manual) or .../chapters/import (.txt).
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify, withSuffix } from "@/lib/slug";
import { stripDangerousMarkup } from "@/lib/sanitizeText";
import { logActivity } from "@/lib/adminActivity";

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  const author = typeof body?.author === "string" ? body.author.trim() || null : null;
  const description = typeof body?.description === "string" ? body.description.trim() || null : null;
  const coverImageUrl = typeof body?.coverImageUrl === "string" ? body.coverImageUrl.trim() || null : null;

  const sanitizedTitle = stripDangerousMarkup(title);
  const sanitizedDescription = description ? stripDangerousMarkup(description) : null;

  // No sourceUrl to derive a slug from (see slugFromSourceUrl's doc
  // comment -- that deriver is specifically for URL-based novels) --
  // slugify the title instead, same dedup-by-suffix loop already used
  // for scraped novels.
  const baseSlug = slugify(sanitizedTitle);
  let slug = baseSlug;
  for (let attempt = 0; await prisma.novel.findUnique({ where: { slug } }); attempt++) {
    slug = withSuffix(baseSlug, attempt + 1);
  }

  const userId = Number(session.user.id);
  const novel = await prisma.novel.create({
    data: {
      slug,
      title: sanitizedTitle,
      originalTitle: sanitizedTitle,
      description: sanitizedDescription,
      originalDescription: sanitizedDescription,
      author,
      coverImageUrl,
      sourceUrl: null,
      status: "READY",
      origin: "USER_CREATED",
      addedByUserId: userId,
    },
  });

  await logActivity({
    userId,
    action: "novel.create_user_authored",
    targetType: "novel",
    targetId: novel.slug,
  });

  return Response.json({ novel }, { status: 201 });
}
