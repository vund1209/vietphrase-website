// Anonymous per-browser identifier for "continue reading" (see
// prisma/schema.prisma's ReadingProgress model for why this is a cookie
// rather than tied to a User account).
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "reader_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Read-only -- safe to call from a Server Component. */
export async function getReaderId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

/**
 * Reads the reader-id cookie, creating and setting one if missing. Only
 * callable from a context that can set cookies (Route Handler / Server
 * Action) -- Server Components can't set cookies mid-render.
 */
export async function getOrCreateReaderId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const id = randomUUID();
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });
  return id;
}

/** Current reader's progress for one novel, or null if none/no cookie yet. */
export async function getReadingProgress(novelId: number): Promise<{ chapterNumber: number } | null> {
  const readerId = await getReaderId();
  if (!readerId) return null;
  return prisma.readingProgress.findUnique({
    where: { readerId_novelId: { readerId, novelId } },
    select: { chapterNumber: true },
  });
}
