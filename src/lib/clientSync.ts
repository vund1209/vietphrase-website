"use client";

// Client-side storage for the two things that are personal to one
// browser/reader and shouldn't live only in a cookie: word/name
// overrides and reading progress. See the planning doc's sections 3-4.
//
// One IndexedDB database, three object stores, all keyed by novel *slug*
// (not the numeric novelId) -- every client component in the reading
// flow (ChapterReader, SpanEditor, CandidateNamesPanel, the novel page)
// already carries the slug as its primary identifier, so this avoids
// threading a second, numeric id down to the client purely for this:
//  - `personalOverrides` (key: "<novelSlug>:<chineseText>") -- a reader's
//    own dictionary corrections. For an anonymous reader this is the
//    *only* copy that exists anywhere. For a signed-in reader, Postgres
//    (UserWordOverride/UserNameOverride) is the durable copy and this is
//    a fast local mirror kept in sync at save time and once per login
//    (see ClientSyncBoundary.tsx).
//  - `readingProgress` (key: novelSlug) -- same idea, for "continue
//    reading" position (see ReadingProgress in prisma/schema.prisma,
//    which is now userId-only -- an anonymous reader's progress never
//    reaches Postgres at all).
//  - `meta` (fixed key "meta") -- tracks which account this browser's
//    store was last synced against, so ClientSyncBoundary can tell a
//    fresh login from the same account continuing.
//
// Hand-rolled rather than a library: this is three stores and simple
// key lookups, not worth a dependency.

const DB_NAME = "vietphrase-client";
const DB_VERSION = 1;
const OVERRIDES_STORE = "personalOverrides";
const PROGRESS_STORE = "readingProgress";
const META_STORE = "meta";
const META_KEY = "meta";

export type OverrideTrack = "phrase" | "name";
export type ClientCapStyle = "NONE" | "FIRST_LETTER" | "ALL_WORDS";

export interface PersonalOverrideRecord {
  novelSlug: string;
  chineseText: string;
  vietnameseText: string;
  capStyle: ClientCapStyle;
  track: OverrideTrack;
  updatedAt: string;
}

export interface ReadingProgressRecord {
  novelSlug: string;
  /** Denormalized so an anonymous continue-reading list can render without a server round trip. */
  novelTitle: string;
  chapterNumber: number;
  updatedAt: string;
}

interface ClientMeta {
  syncedUserId: number | null;
  lastSyncedAt: string | null;
}

function overrideKey(novelSlug: string, chineseText: string): string {
  return `${novelSlug}:${chineseText}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!isBrowser()) return Promise.reject(new Error("IndexedDB unavailable"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OVERRIDES_STORE)) {
        db.createObjectStore(OVERRIDES_STORE);
      }
      if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
        db.createObjectStore(PROGRESS_STORE);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoreAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(storeName, "readonly");
    return await request(tx.objectStore(storeName).getAll());
  } catch {
    return [];
  }
}

// --- meta -------------------------------------------------------------

export async function getClientMeta(): Promise<ClientMeta> {
  try {
    const db = await openDb();
    const tx = db.transaction(META_STORE, "readonly");
    const value = await request<ClientMeta | undefined>(tx.objectStore(META_STORE).get(META_KEY));
    return value ?? { syncedUserId: null, lastSyncedAt: null };
  } catch {
    return { syncedUserId: null, lastSyncedAt: null };
  }
}

export async function setClientMeta(patch: Partial<ClientMeta>): Promise<void> {
  try {
    const db = await openDb();
    const current = await getClientMeta();
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put({ ...current, ...patch }, META_KEY);
  } catch {
    // Best-effort -- a failed local write shouldn't break the reading flow.
  }
}

// --- personal overrides -------------------------------------------------

export async function getAllPersonalOverrides(): Promise<PersonalOverrideRecord[]> {
  return getStoreAll<PersonalOverrideRecord>(OVERRIDES_STORE);
}

export async function getPersonalOverridesForNovel(novelSlug: string): Promise<PersonalOverrideRecord[]> {
  const all = await getAllPersonalOverrides();
  return all.filter((o) => o.novelSlug === novelSlug);
}

export async function putPersonalOverride(record: PersonalOverrideRecord): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(OVERRIDES_STORE, "readwrite");
    tx.objectStore(OVERRIDES_STORE).put(record, overrideKey(record.novelSlug, record.chineseText));
  } catch {
    // Best-effort.
  }
}

export async function clearPersonalOverrides(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(OVERRIDES_STORE, "readwrite");
    tx.objectStore(OVERRIDES_STORE).clear();
  } catch {
    // Best-effort.
  }
}

// --- reading progress ----------------------------------------------------

export async function getAllReadingProgress(): Promise<ReadingProgressRecord[]> {
  return getStoreAll<ReadingProgressRecord>(PROGRESS_STORE);
}

export async function getReadingProgressLocal(novelSlug: string): Promise<ReadingProgressRecord | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(PROGRESS_STORE, "readonly");
    const value = await request<ReadingProgressRecord | undefined>(
      tx.objectStore(PROGRESS_STORE).get(novelSlug)
    );
    return value ?? null;
  } catch {
    return null;
  }
}

export async function putReadingProgressLocal(
  novelSlug: string,
  novelTitle: string,
  chapterNumber: number
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(PROGRESS_STORE, "readwrite");
    tx.objectStore(PROGRESS_STORE).put(
      { novelSlug, novelTitle, chapterNumber, updatedAt: new Date().toISOString() },
      novelSlug
    );
  } catch {
    // Best-effort.
  }
}

export async function clearReadingProgressLocal(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(PROGRESS_STORE, "readwrite");
    tx.objectStore(PROGRESS_STORE).clear();
  } catch {
    // Best-effort.
  }
}

// --- derived helpers ----------------------------------------------------

/**
 * Builds the tokenizer-shaped {translations, capStyles} maps from this
 * browser's personal overrides for one novel -- what ChapterReader
 * applies over the server's (now personal-free, see src/lib/novels.ts)
 * tokens once on mount. Mirrors src/lib/overrides.ts's OverrideLayer
 * shape without importing it (that module pulls in Prisma/node:sqlite
 * and can't be bundled for the browser).
 */
export async function loadLocalOverrideLayer(
  novelSlug: string
): Promise<{ translations: Map<string, string>; capStyles: Map<string, ClientCapStyle> }> {
  const records = await getPersonalOverridesForNovel(novelSlug);
  return {
    translations: new Map(records.map((r) => [r.chineseText, r.vietnameseText])),
    capStyles: new Map(records.map((r) => [r.chineseText, r.capStyle])),
  };
}
