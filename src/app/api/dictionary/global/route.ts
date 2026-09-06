// Admin-curated corrections that apply to every novel -- see
// prisma/schema.prisma's GlobalWordOverride/GlobalNameOverride models and
// docs/PLANNED_FEATURES.md. Bigger blast radius than a per-novel promote
// (.../overrides/promote/route.ts), so this is ADMIN-only rather than
// EDITOR+ADMIN. `track` picks which table this reads/writes -- "phrase"
// (GlobalWordOverride) or "name" (GlobalNameOverride), see
// src/lib/overrides.ts's file header.
import { auth, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateOverridePair, validateCapStyle, validateTrack, type OverrideTrack } from "@/lib/overrides";
import { bumpDictionaryVersion } from "@/lib/dictionaryVersion";
import { logActivity } from "@/lib/adminActivity";

function trackFromQuery(url: URL): OverrideTrack {
  const raw = url.searchParams.get("track");
  return validateTrack(raw) ? raw : "phrase";
}

// Used by /admin/dictionary to list/search existing entries.
export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return Response.json({ error: "Admin role required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const track = trackFromQuery(url);
  const where = q ? { chineseText: { contains: q } } : {};
  const select = {
    id: true,
    chineseText: true,
    vietnameseText: true,
    capStyle: true,
    isActive: true,
    updatedAt: true,
  } as const;

  const entries =
    track === "name"
      ? await prisma.globalNameOverride.findMany({ where, orderBy: { updatedAt: "desc" }, take: 100, select })
      : await prisma.globalWordOverride.findMany({ where, orderBy: { updatedAt: "desc" }, take: 100, select });
  return Response.json({ entries, track });
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
  const track: OverrideTrack = validateTrack(body?.track) ? body.track : "phrase";

  const adminId = Number(session.user.id);
  const phraseLength = chineseText.length;
  const entry =
    track === "name"
      ? await prisma.globalNameOverride.upsert({
          where: { chineseText },
          create: { chineseText, vietnameseText, capStyle, phraseLength, source: "admin_edit", createdById: adminId },
          update: { vietnameseText, capStyle, isActive: true },
        })
      : await prisma.globalWordOverride.upsert({
          where: { chineseText },
          create: { chineseText, vietnameseText, capStyle, phraseLength, source: "admin_edit", createdById: adminId },
          update: { vietnameseText, capStyle, isActive: true },
        });

  // See src/lib/overrides.ts's loadOverridesForNovelCached -- invalidates
  // every reader's cached shared-override layer.
  await bumpDictionaryVersion();

  await logActivity({
    userId: adminId,
    action: "global_dictionary.add",
    targetType: "global_override",
    targetId: String(entry.id),
    metadata: { chineseText, vietnameseText, track },
  });

  return Response.json({ entry: { ...entry, track } });
}
