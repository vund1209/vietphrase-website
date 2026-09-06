import type { Prisma } from "@prisma/client";
import { getNovelBySlug } from "@/lib/novels";
import { auth, isAdmin } from "@/lib/auth";
import { isOwnerOrAdmin } from "@/lib/isOwnerOrAdmin";
import { prisma } from "@/lib/prisma";
import { stripDangerousMarkup } from "@/lib/sanitizeText";
import { logActivity } from "@/lib/adminActivity";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;

  const novel = await getNovelBySlug(slug);
  if (!novel) {
    return Response.json({ error: "Novel not found" }, { status: 404 });
  }

  return Response.json({ novel });
}

// Removes a novel and everything scoped to it (chapters, shared Name
// overrides, readers' private UserWordOverride rows) via the schema's
// onDelete: Cascade -- a single delete call is enough. A SCRAPED novel
// stays admin-only; a USER_CREATED novel's owner can also delete their
// own (isOwnerOrAdmin) -- see the planning doc's section 8.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const { slug } = await params;
  const novel = await prisma.novel.findUnique({
    where: { slug },
    select: { id: true, origin: true, addedByUserId: true },
  });
  if (!novel) {
    return Response.json({ error: "Novel not found" }, { status: 404 });
  }
  const authorized = novel.origin === "USER_CREATED" ? isOwnerOrAdmin(novel, session) : isAdmin(session.user.role);
  if (!authorized) {
    return Response.json({ error: "Not authorized to delete this novel" }, { status: 403 });
  }

  await prisma.novel.delete({ where: { slug } });
  await logActivity({
    userId: Number(session.user.id),
    action: "novel.delete",
    targetType: "novel",
    targetId: slug,
  });
  return Response.json({ ok: true });
}

const COMPLETION_STATUSES = ["ONGOING", "COMPLETED", null] as const;

// Two independent, separately-authorized edits share this one route:
// - completionStatus: admin-only, either origin (unchanged from before --
//   an editorial/moderation judgment call, not something an owner sets).
// - title: a USER_CREATED novel's owner may rename their own (or an
//   admin, either origin) -- there was previously no way to fix a typo'd
//   or placeholder title after creation at all. Renaming never touches
//   `slug` (URLs/bookmarks stay stable) -- only the display title.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const { slug } = await params;
  const novel = await prisma.novel.findUnique({
    where: { slug },
    select: { id: true, origin: true, addedByUserId: true },
  });
  if (!novel) {
    return Response.json({ error: "Novel not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const updates: Prisma.NovelUpdateInput = {};
  const logged: Record<string, unknown> = {};

  if (body && "completionStatus" in body) {
    if (!isAdmin(session.user.role)) {
      return Response.json({ error: "Admin role required" }, { status: 403 });
    }
    const completionStatus = body.completionStatus ?? null;
    if (!COMPLETION_STATUSES.includes(completionStatus)) {
      return Response.json(
        { error: `completionStatus must be one of ${COMPLETION_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    updates.completionStatus = completionStatus;
    logged.completionStatus = completionStatus;
  }

  if (body && "title" in body) {
    const authorized = novel.origin === "USER_CREATED" ? isOwnerOrAdmin(novel, session) : isAdmin(session.user.role);
    if (!authorized) {
      return Response.json({ error: "Not authorized to rename this novel" }, { status: 403 });
    }
    const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
    if (!rawTitle) {
      return Response.json({ error: "title cannot be empty" }, { status: 400 });
    }
    const title = stripDangerousMarkup(rawTitle);
    updates.title = title;
    // originalTitle mirrors title only for USER_CREATED novels (same
    // convention as the create route -- there's no separate raw-vs-
    // translated distinction for self-authored content). A SCRAPED
    // novel's originalTitle is the real scraped source-language title,
    // used to recompute `title` after a dictionary promotion -- an
    // admin renaming the *displayed* title must never overwrite that.
    if (novel.origin === "USER_CREATED") updates.originalTitle = title;
    logged.title = title;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.novel.update({ where: { slug }, data: updates });
  await logActivity({
    userId: Number(session.user.id),
    action: "novel.update",
    targetType: "novel",
    targetId: slug,
    metadata: logged,
  });
  return Response.json({ novel: updated });
}
