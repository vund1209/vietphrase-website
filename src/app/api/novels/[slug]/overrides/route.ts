// A reader's private word overrides for one novel. See
// docs/ARCHITECTURE.md "User management and per-word overrides": these
// are visible only to the reader who saved them until an editor
// promotes one into the novel's shared Name dictionary (see
// ./promote/route.ts).
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateOverridePair, validateCapStyle } from "@/lib/overrides";

async function resolveNovelId(slug: string): Promise<number | null> {
  const novel = await prisma.novel.findUnique({ where: { slug }, select: { id: true } });
  return novel?.id ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const { slug } = await params;
  const novelId = await resolveNovelId(slug);
  if (novelId === null) {
    return Response.json({ error: "Novel not found" }, { status: 404 });
  }

  const overrides = await prisma.userWordOverride.findMany({
    where: { novelId, userId: Number(session.user.id) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, chineseText: true, vietnameseText: true, capStyle: true, updatedAt: true },
  });

  return Response.json({ overrides });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const { slug } = await params;
  const novelId = await resolveNovelId(slug);
  if (novelId === null) {
    return Response.json({ error: "Novel not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const chineseText = typeof body?.chineseText === "string" ? body.chineseText.trim() : "";
  const vietnameseText =
    typeof body?.vietnameseText === "string" ? body.vietnameseText.trim() : "";

  const validationError = validateOverridePair(chineseText, vietnameseText);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }
  const capStyle = body?.capStyle ?? "NONE";
  if (!validateCapStyle(capStyle)) {
    return Response.json({ error: "Invalid capStyle" }, { status: 400 });
  }

  const userId = Number(session.user.id);
  const override = await prisma.userWordOverride.upsert({
    where: { userId_novelId_chineseText: { userId, novelId, chineseText } },
    create: {
      userId,
      novelId,
      chineseText,
      vietnameseText,
      capStyle,
      phraseLength: chineseText.length,
    },
    update: { vietnameseText, capStyle, phraseLength: chineseText.length },
  });

  return Response.json({ override }, { status: 201 });
}
