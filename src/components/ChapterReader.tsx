"use client";

// Interactive, per-word reader: every translated token is its own
// clickable span. Clicking one seeds a selection that can be expanded
// left/right across adjacent tokens (see SpanEditor.tsx) to define a new
// multi-character dictionary phrase -- mimicking sangtacviet.com's
// per-phrase editor. Saving writes a *private* override for that reader
// only (see docs/ARCHITECTURE.md "User management and per-word
// overrides") unless promoted to the shared dictionary.
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { DisplayToken, CapStyle } from "@/lib/tokenizer";
import { needsSpaceBetween } from "@/lib/tokenSpacing";
import { SpanEditor, type ReuseEntry, type OverrideTrack } from "./SpanEditor";
import { CandidateNamesPanel } from "./CandidateNamesPanel";
import { useToast } from "./ToastProvider";
import { loadLocalOverrideLayer, putPersonalOverride } from "@/lib/clientSync";

interface ChapterReaderProps {
  novelSlug: string;
  chapterNumber: number;
  lines: DisplayToken[][];
  canPromote: boolean;
  canApplyGlobally: boolean;
  /**
   * Whether this reader is signed in. A personal save always writes to
   * IndexedDB (see src/lib/clientSync.ts); it also POSTs to Postgres only
   * when signed in -- an anonymous save never creates a
   * UserWordOverride/UserNameOverride row. See the planning doc's
   * section 3 for why the personal tier moved entirely client-side.
   */
  isSignedIn: boolean;
}

interface SpanSelection {
  line: number;
  start: number;
  end: number; // inclusive
}

function capitalizeEachSyllable(text: string): string {
  return text
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

// Client-side copy of src/lib/tokenizer.ts's applyCapStyle -- can't
// import the real one, since that module pulls in the node:sqlite-backed
// tokenizer and can't be bundled for the browser. Only used for the
// optimistic local render right after saving; the next real navigation
// re-tokenizes from the server and is the source of truth.
function applyCapStyleClient(text: string, style: CapStyle): string {
  if (style === "ALL_WORDS") {
    return text.replace(/(^|\s)(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
  }
  if (style === "FIRST_LETTER") {
    return text.replace(/^([^\p{L}]*)(\p{L})/u, (_, lead: string, letter: string) => lead + letter.toUpperCase());
  }
  return text;
}

/**
 * Rebuilds `line`, replacing any exact run of tokens whose concatenated
 * `chinese` text equals `chineseText` with one token built by `build`
 * from the matched underlying tokens (so hanViet/etc. can be
 * reconstructed from them). No-op if `chineseText` doesn't appear.
 */
function mergeRunIntoLine(
  line: DisplayToken[],
  chineseText: string,
  build: (matched: DisplayToken[]) => DisplayToken
): DisplayToken[] {
  const joined = line.map((t) => t.chinese).join("");
  if (!joined.includes(chineseText)) return line;
  const rebuilt: DisplayToken[] = [];
  let i = 0;
  while (i < line.length) {
    let acc = "";
    let j = i;
    while (j < line.length && acc.length < chineseText.length) {
      acc += line[j].chinese;
      j++;
    }
    if (acc === chineseText) {
      rebuilt.push(build(line.slice(i, j)));
      i = j;
    } else {
      rebuilt.push(line[i]);
      i++;
    }
  }
  return rebuilt;
}

function buildOverrideToken(matched: DisplayToken[], vietnameseText: string, capStyle: CapStyle): DisplayToken {
  return {
    chinese: matched.map((t) => t.chinese).join(""),
    vietnamese: applyCapStyleClient(vietnameseText.split("/")[0], capStyle),
    rawVietnamese: vietnameseText,
    source: "name",
    hanViet: matched.map((t) => t.hanViet).join(" "),
    capStyle,
  };
}

/**
 * Applies every entry in a personal-override layer (see
 * src/lib/clientSync.ts's loadLocalOverrideLayer) over server-provided,
 * personal-free tokens (see src/lib/novels.ts's tokenizeChapter) --
 * used both once on mount (this browser's saved overrides for this
 * novel) and, via a single-entry map, right after a fresh save so it
 * appears instantly without waiting for a re-navigation. Longest
 * chineseText first, so a longer override wins over a shorter one that
 * happens to be a substring of it (mirrors the real tokenizer's
 * longest-match rule).
 */
function applyOverridesToLines(
  lines: DisplayToken[][],
  overrides: Map<string, { vietnameseText: string; capStyle: CapStyle }>
): DisplayToken[][] {
  if (overrides.size === 0) return lines;
  const entries = [...overrides.entries()].sort((a, b) => b[0].length - a[0].length);
  return lines.map((line) => {
    let current = line;
    for (const [chineseText, { vietnameseText, capStyle }] of entries) {
      current = mergeRunIntoLine(current, chineseText, (matched) =>
        buildOverrideToken(matched, vietnameseText, capStyle)
      );
    }
    return current;
  });
}

export function ChapterReader({
  novelSlug,
  chapterNumber,
  lines,
  canPromote,
  canApplyGlobally,
  isSignedIn,
}: ChapterReaderProps) {
  const showToast = useToast();
  const [tokenLines, setTokenLines] = useState(lines);
  const [selection, setSelection] = useState<SpanSelection | null>(null);
  const [hanViet, setHanViet] = useState("");
  const [hanVietCapitalized, setHanVietCapitalized] = useState("");
  const [translation, setTranslation] = useState("");
  const [capStyle, setCapStyle] = useState<CapStyle>("NONE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The server's tokens never include this reader's personal overrides
  // (see src/lib/novels.ts's tokenizeChapter) -- apply whatever's saved
  // in this browser's IndexedDB on top once per chapter view. Runs for
  // both anonymous and signed-in readers: for a signed-in reader,
  // ClientSyncBoundary.tsx is what keeps this IndexedDB copy in sync
  // with Postgres in the first place. Relies on the parent keying
  // `<ChapterReader key={chapterNumber}>` to force a fresh mount (and
  // therefore a fresh `useState(lines)`) per chapter view, rather than
  // resetting tokenLines from an effect.
  useEffect(() => {
    let cancelled = false;
    loadLocalOverrideLayer(novelSlug).then(({ translations, capStyles }) => {
      if (cancelled || translations.size === 0) return;
      const overrides = new Map(
        [...translations].map(([chineseText, vietnameseText]) => [
          chineseText,
          { vietnameseText, capStyle: capStyles.get(chineseText) ?? "NONE" },
        ])
      );
      setTokenLines((prev) => applyOverridesToLines(prev, overrides));
    });
    return () => {
      cancelled = true;
    };
  }, [novelSlug]);

  const spanTokens = useMemo(() => {
    if (!selection) return null;
    return tokenLines[selection.line]?.slice(selection.start, selection.end + 1) ?? null;
  }, [selection, tokenLines]);

  const chinese = useMemo(() => spanTokens?.map((t) => t.chinese).join("") ?? "", [spanTokens]);

  function openEditor(line: number, index: number) {
    const token = tokenLines[line][index];
    const sel: SpanSelection = { line, start: index, end: index };
    setSelection(sel);
    resetFieldsFor([token]);
    setError(null);
  }

  function resetFieldsFor(tokens: DisplayToken[]) {
    const hv = tokens.map((t) => t.hanViet).join(" ");
    setHanViet(hv);
    setHanVietCapitalized(capitalizeEachSyllable(hv));
    setTranslation(
      tokens.length === 1 ? tokens[0].rawVietnamese : tokens.map((t) => t.vietnamese).join(" ")
    );
    // A brand-new multi-token span can't already have a capStyle (if it
    // did, the tokenizer would already have merged it into one token) --
    // only prefill from an existing single-token entry being re-edited.
    setCapStyle(tokens.length === 1 ? tokens[0].capStyle : "NONE");
  }

  function expand(direction: "left" | "right") {
    if (!selection) return;
    const line = tokenLines[selection.line];
    const next =
      direction === "left"
        ? { ...selection, start: Math.max(0, selection.start - 1) }
        : { ...selection, end: Math.min(line.length - 1, selection.end + 1) };
    setSelection(next);
    resetFieldsFor(line.slice(next.start, next.end + 1));
  }

  function closeEditor() {
    setSelection(null);
    setError(null);
  }

  // Clicking anywhere outside the editor (or another token, which
  // instead re-seeds the selection via its own onClick) closes it --
  // matches sangtacviet.com's tooltip, which doesn't need an explicit
  // Hủy click either. Listens on "mousedown" (fires before "click") so a
  // click on a token still closes-then-immediately-reopens with the new
  // selection rather than being swallowed as just a close.
  useEffect(() => {
    if (!selection) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Element;
      if (target.closest("[data-span-editor]") || target.closest("[data-token]")) return;
      closeEditor();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only open/close transitions need to re-attach, not every field/selection change
  }, [Boolean(selection)]);

  function reuseEntry(entry: ReuseEntry) {
    if (entry.track === "name") {
      setHanVietCapitalized(entry.vietnameseText);
      return;
    }
    setTranslation(entry.vietnameseText);
    setCapStyle(entry.capStyle);
  }

  // Phrase-track saves use the Tr/capStyle fields; name-track quick-adds
  // reuse the HV field's value directly with capStyle forced to
  // ALL_WORDS -- see SpanEditor.tsx's "Tên riêng / Danh từ" block.
  function valueFor(track: OverrideTrack): { vietnameseText: string; capStyle: CapStyle } {
    return track === "name"
      ? { vietnameseText: hanVietCapitalized.trim(), capStyle: "ALL_WORDS" }
      : { vietnameseText: translation.trim(), capStyle };
  }

  // Optimistically collapses the just-saved span into a single merged
  // token wherever it appears in the currently-rendered chapter -- the
  // next real navigation re-tokenizes from the server and reconciles
  // fully. Shared by every action (personal/promote/global) and both
  // anonymous and signed-in paths.
  function applyLocalMerge(vietnameseText: string, capStyleToSend: CapStyle) {
    setTokenLines((prev) =>
      prev.map((tline) =>
        mergeRunIntoLine(tline, chinese, (matched) => buildOverrideToken(matched, vietnameseText, capStyleToSend))
      )
    );
  }

  async function saveOverride(action: "personal" | "promote" | "global", track: OverrideTrack) {
    const { vietnameseText, capStyle: capStyleToSend } = valueFor(track);
    if (!chinese.trim() || !vietnameseText) {
      setError("Bản dịch không được để trống.");
      return;
    }

    // Anonymous personal save: IndexedDB only, no server round-trip --
    // never creates a UserWordOverride/UserNameOverride row (see
    // src/lib/clientSync.ts and the planning doc's section 3). Promote/
    // global are never reachable here for an anonymous reader --
    // canPromote/canApplyGlobally are always false without a session.
    if (action === "personal" && !isSignedIn) {
      setSaving(true);
      await putPersonalOverride({
        novelSlug,
        chineseText: chinese,
        vietnameseText,
        capStyle: capStyleToSend,
        track,
        updatedAt: new Date().toISOString(),
      });
      setSaving(false);
      showToast("Đã lưu (chỉ trên trình duyệt này).");
      applyLocalMerge(vietnameseText, capStyleToSend);
      setSelection(null);
      return;
    }

    const url =
      action === "personal"
        ? `/api/novels/${novelSlug}/overrides`
        : action === "promote"
          ? `/api/novels/${novelSlug}/overrides/promote`
          : "/api/dictionary/global";
    const successMessage =
      action === "personal"
        ? "Đã lưu (chỉ mình bạn thấy)."
        : action === "promote"
          ? "Đã áp dụng cho mọi người đọc truyện này."
          : "Đã áp dụng cho toàn bộ từ điển.";

    setSaving(true);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chineseText: chinese, vietnameseText, capStyle: capStyleToSend, track }),
    });
    setSaving(false);

    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      setError(body?.error ?? "Lưu thất bại.");
      return;
    }
    showToast(successMessage);

    if (action === "personal") {
      // Signed-in personal save: Postgres stays the durable copy; mirror
      // into IndexedDB too so it's available instantly next visit even
      // before any login-sync round trip.
      await putPersonalOverride({
        novelSlug,
        chineseText: chinese,
        vietnameseText,
        capStyle: capStyleToSend,
        track,
        updatedAt: new Date().toISOString(),
      });
    }

    applyLocalMerge(vietnameseText, capStyleToSend);
    setSelection(null);
  }

  return (
    <>
      <CandidateNamesPanel novelSlug={novelSlug} chapterNumber={chapterNumber} isSignedIn={isSignedIn} />
      <article className="prose-reading text-lg">
      {tokenLines.map((line, lineIndex) => (
        <p key={lineIndex} className="mb-4">
          {line.length === 0
            ? " "
            : line.map((token, tokenIndex) => {
                const isSelected =
                  selection?.line === lineIndex &&
                  tokenIndex >= selection.start &&
                  tokenIndex <= selection.end;
                const nextToken = line[tokenIndex + 1];
                const trailingSpace =
                  nextToken && needsSpaceBetween(token.chinese, nextToken.chinese) ? " " : "";
                return (
                  <span key={tokenIndex} data-token="true" className="group relative inline-block">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => openEditor(lineIndex, tokenIndex)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openEditor(lineIndex, tokenIndex);
                        }
                      }}
                      className={`cursor-pointer rounded px-0.5 transition-colors hover:bg-accent/20 ${
                        isSelected ? "bg-accent/30" : ""
                      }`}
                    >
                      {token.vietnamese}
                      {trailingSpace}
                    </span>
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background group-hover:block">
                      {token.chinese} · {token.hanViet}
                    </span>
                  </span>
                );
              })}
        </p>
      ))}

      <AnimatePresence>
        {selection && spanTokens && (
          <SpanEditor
            novelSlug={novelSlug}
            chinese={chinese}
            hanViet={hanViet}
            onHanVietChange={setHanViet}
            hanVietCapitalized={hanVietCapitalized}
            onHanVietCapitalizedChange={setHanVietCapitalized}
            translation={translation}
            onTranslationChange={setTranslation}
            capStyle={capStyle}
            onCapStyleChange={setCapStyle}
            canExpandLeft={selection.start > 0}
            canExpandRight={selection.end < tokenLines[selection.line].length - 1}
            onExpandLeft={() => expand("left")}
            onExpandRight={() => expand("right")}
            canPromote={canPromote}
            canApplyGlobally={canApplyGlobally}
            saving={saving}
            error={error}
            onSavePersonal={(track: OverrideTrack) => saveOverride("personal", track)}
            onPromote={(track: OverrideTrack) => saveOverride("promote", track)}
            onApplyGlobal={(track: OverrideTrack) => saveOverride("global", track)}
            onReuseEntry={reuseEntry}
            onClose={closeEditor}
          />
        )}
      </AnimatePresence>
      </article>
    </>
  );
}
