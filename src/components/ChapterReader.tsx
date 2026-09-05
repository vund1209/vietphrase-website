"use client";

// Interactive, per-word reader: every translated token is its own
// clickable span. Clicking one seeds a selection that can be expanded
// left/right across adjacent tokens (see SpanEditor.tsx) to define a new
// multi-character dictionary phrase -- mimicking sangtacviet.com's
// per-phrase editor. Saving writes a *private* override for that reader
// only (see docs/ARCHITECTURE.md "User management and per-word
// overrides") unless promoted to the shared dictionary.
import { useEffect, useMemo, useState } from "react";
import type { DisplayToken, CapStyle } from "@/lib/tokenizer";
import { needsSpaceBetween } from "@/lib/tokenSpacing";
import { SpanEditor, type ReuseEntry } from "./SpanEditor";

interface ChapterReaderProps {
  novelSlug: string;
  lines: DisplayToken[][];
  canPromote: boolean;
  canApplyGlobally: boolean;
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

export function ChapterReader({
  novelSlug,
  lines,
  canPromote,
  canApplyGlobally,
}: ChapterReaderProps) {
  const [tokenLines, setTokenLines] = useState(lines);
  const [selection, setSelection] = useState<SpanSelection | null>(null);
  const [hanViet, setHanViet] = useState("");
  const [hanVietCapitalized, setHanVietCapitalized] = useState("");
  const [translation, setTranslation] = useState("");
  const [capStyle, setCapStyle] = useState<CapStyle>("NONE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setTranslation(entry.vietnameseText);
    setCapStyle(entry.capStyle);
  }

  async function submit(url: string) {
    if (!chinese.trim() || !translation.trim()) {
      setError("Bản dịch không được để trống.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chineseText: chinese,
        vietnameseText: translation.trim(),
        capStyle,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const body: { error?: string } | null = await res.json().catch(() => null);
      setError(body?.error ?? "Lưu thất bại.");
      return;
    }

    // Optimistically collapse the saved span into a single merged token
    // wherever it appears in the currently-rendered chapter -- the next
    // real navigation re-tokenizes from the server and reconciles fully.
    const mergedToken: DisplayToken = {
      chinese,
      vietnamese: applyCapStyleClient(translation.trim().split("/")[0], capStyle),
      rawVietnamese: translation.trim(),
      source: "name",
      hanViet,
      capStyle,
    };
    setTokenLines((prev) =>
      prev.map((tline) => {
        const joined = tline.map((t) => t.chinese).join(" ");
        if (!joined.includes(chinese)) return tline;
        // Rebuild the line, replacing any exact run of tokens whose
        // concatenated chinese text equals the saved span with one
        // merged token.
        const rebuilt: DisplayToken[] = [];
        let i = 0;
        while (i < tline.length) {
          let acc = "";
          let j = i;
          while (j < tline.length && acc.length < chinese.length) {
            acc += tline[j].chinese;
            j++;
          }
          if (acc === chinese) {
            rebuilt.push(mergedToken);
            i = j;
          } else {
            rebuilt.push(tline[i]);
            i++;
          }
        }
        return rebuilt;
      })
    );
    setSelection(null);
  }

  return (
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
                      className={`cursor-pointer rounded px-0.5 hover:bg-yellow-100 dark:hover:bg-yellow-900 ${
                        isSelected ? "bg-yellow-200 dark:bg-yellow-800" : ""
                      }`}
                    >
                      {token.vietnamese}
                      {trailingSpace}
                    </span>
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-xs text-white group-hover:block dark:bg-neutral-100 dark:text-neutral-900">
                      {token.chinese} · {token.hanViet}
                    </span>
                  </span>
                );
              })}
        </p>
      ))}

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
          onSavePersonal={() => submit(`/api/novels/${novelSlug}/overrides`)}
          onPromote={() => submit(`/api/novels/${novelSlug}/overrides/promote`)}
          onApplyGlobal={() => submit("/api/dictionary/global")}
          onReuseEntry={reuseEntry}
          onClose={closeEditor}
        />
      )}
    </article>
  );
}
