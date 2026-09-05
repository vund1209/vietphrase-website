import { getNovelBySlug } from "@/lib/novels";
import { auth, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

// Admin-only: remove a novel and everything scoped to it (chapters,
// shared Name overrides, readers' private UserWordOverride rows) via the
// schema's onDelete: Cascade -- a single delete call is enough.
export async function DELETE(
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
  const novel = await prisma.novel.findUnique({ where: { slug }, select: { id: true } });
  if (!novel) {
    return Response.json({ error: "Novel not found" }, { status: 404 });
  }

  await prisma.novel.delete({ where: { slug } });
  return Response.json({ ok: true });
}
