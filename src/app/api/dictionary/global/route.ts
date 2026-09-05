// Admin-curated corrections that apply to every novel -- see
// prisma/schema.prisma's GlobalWordOverride model and
// docs/PLANNED_FEATURES.md. Bigger blast radius than a per-novel promote
// (.../overrides/promote/route.ts), so this is ADMIN-only rather than
// EDITOR+ADMIN.
import { auth, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateOverridePair, validateCapStyle } from "@/lib/overrides";

// Used by /admin/dictionary to list/search existing entries.
export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return Response.json({ error: "Admin role required" }, { status: 403 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const entries = await prisma.globalWordOverride.findMany({
    where: q ? { chineseText: { contains: q } } : {},
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      chineseText: true,
      vietnameseText: true,
      capStyle: true,
      isActive: true,
      updatedAt: true,
    },
  });
  return Response.json({ entries });
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return Response.json({ error: "Admin role required" }, { status: 403 });
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

  const adminId = Number(session.user.id);
  const entry = await prisma.globalWordOverride.upsert({
    where: { chineseText },
    create: {
      chineseText,
      vietnameseText,
      capStyle,
      phraseLength: chineseText.length,
      source: "admin_edit",
      createdById: adminId,
    },
    update: {
      vietnameseText,
      capStyle,
      isActive: true,
    },
  });

  return Response.json({ entry });
}
