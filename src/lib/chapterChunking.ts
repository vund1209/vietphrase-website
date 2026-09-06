// Splits an uploaded .txt novel into chapters, and detects whether its
// text is Chinese or already-Vietnamese -- see the planning doc's section
// 8. Two paths: real chapter-heading detection first; a size-based,
// sentence-boundary-aware fallback if no headings are found anywhere in
// the file.
import type { SourceLanguage } from "@prisma/client";

const HAN_CHAR_RE = /\p{Script=Han}/gu;

// A Han-character-ratio heuristic -- not true language detection, just
// "does this read as Chinese source text or already-translated
// Vietnamese prose." Vietnamese written with the Latin alphabet has
// essentially zero Han characters; a Chinese novel chapter is
// overwhelmingly Han characters plus punctuation.
const ZH_RATIO_THRESHOLD = 0.1;

export function detectSourceLanguage(text: string): SourceLanguage {
  const nonWhitespace = text.replace(/\s/g, "");
  if (nonWhitespace.length === 0) return "VI";
  const hanCount = (text.match(HAN_CHAR_RE) ?? []).length;
  return hanCount / nonWhitespace.length > ZH_RATIO_THRESHOLD ? "ZH" : "VI";
}

// Chinese chapter/volume markers (章回卷节集, and the Traditional 節) plus
// the Vietnamese/English "Chương N"/"Chapter N" forms -- the same label
// set referenced elsewhere in this project's chapter-detection reasoning.
const CJK_HEADING_RE = /^第[0-9一二三四五六七八九十百千万零〇]+\s*[章回卷节節集]/;
const LATIN_HEADING_RE = /^(chương|chapter)\s+\d+/i;

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 60) return false; // a real heading line is short
  return CJK_HEADING_RE.test(trimmed) || LATIN_HEADING_RE.test(trimmed);
}

export interface ParsedChapter {
  title: string;
  rawText: string;
}

const SENTENCE_END_RE = /[。！？.!?]/;
const TARGET_CHUNK_CHARS = 3000;
// How far past the target size this will scan looking for a sentence
// boundary before giving up and cutting mid-sentence anyway (keeps a
// pathological input -- no punctuation at all -- from scanning forever).
const MAX_CHUNK_OVERRUN_CHARS = 1500;

function splitIntoSizedPieces(text: string): string[] {
  const pieces: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + TARGET_CHUNK_CHARS, text.length);
    if (end < text.length) {
      const scanLimit = Math.min(end + MAX_CHUNK_OVERRUN_CHARS, text.length);
      let boundary = -1;
      for (let i = end; i < scanLimit; i++) {
        if (SENTENCE_END_RE.test(text[i])) {
          boundary = i + 1;
          break;
        }
      }
      if (boundary !== -1) end = boundary;
    }
    const rawText = text.slice(start, end).trim();
    if (rawText) pieces.push(rawText);
    start = end;
  }
  return pieces;
}

function chunkBySize(text: string): ParsedChapter[] {
  return splitIntoSizedPieces(text).map((rawText, i) => ({ title: `Chương ${i + 1}`, rawText }));
}

// A compiled novel file occasionally has a long stretch with no
// recognizable heading at all (a different/unrecognized marker format,
// or a genuine gap in the source) -- chunkByHeadings alone would then
// silently swallow the entire stretch into whichever real heading came
// right before it, producing one unreadable multi-megabyte "chapter"
// and making everything after it look like it "jumped ahead" relative to
// the reader's expected pacing. Cap any single heading-derived chunk's
// size and, past that, fall back to the same sentence-boundary-aware
// size splitting `chunkBySize` uses -- this only inserts additional
// boundaries *inside* an oversized span, strictly in file order; it
// never reorders or drops content, matching the request to prioritize
// keeping raw content in order over trying to be clever about splits.
const MAX_HEADING_CHUNK_CHARS = TARGET_CHUNK_CHARS * 4;

function capOversizedChunks(chunks: ParsedChapter[]): ParsedChapter[] {
  const result: ParsedChapter[] = [];
  for (const chunk of chunks) {
    if (chunk.rawText.length <= MAX_HEADING_CHUNK_CHARS) {
      result.push(chunk);
      continue;
    }
    const pieces = splitIntoSizedPieces(chunk.rawText);
    pieces.forEach((rawText, i) => {
      result.push({ title: pieces.length > 1 ? `${chunk.title} (phần ${i + 1})` : chunk.title, rawText });
    });
  }
  return result;
}

function chunkByHeadings(lines: string[], headingIndices: number[]): ParsedChapter[] {
  const chunks: ParsedChapter[] = [];
  for (let i = 0; i < headingIndices.length; i++) {
    const start = headingIndices[i];
    const end = i + 1 < headingIndices.length ? headingIndices[i + 1] : lines.length;
    const title = lines[start].trim();
    const rawText = lines
      .slice(start + 1, end)
      .join("\n")
      .trim();
    if (rawText) chunks.push({ title, rawText });
  }
  return chunks;
}

/**
 * Splits `text` into chapters. Tries chapter-heading detection first; if
 * no heading-shaped line is found anywhere, falls back to size-based
 * chunking extended to the next sentence boundary. Never cuts a chunk
 * off mid-sentence unless the whole remaining tail has no sentence-ending
 * punctuation at all within MAX_CHUNK_OVERRUN_CHARS.
 */
export function chunkNovelText(text: string): ParsedChapter[] {
  const lines = text.split("\n");
  const headingIndices = lines.reduce<number[]>((acc, line, i) => {
    if (isHeadingLine(line)) acc.push(i);
    return acc;
  }, []);

  if (headingIndices.length > 0) {
    return capOversizedChunks(chunkByHeadings(lines, headingIndices));
  }
  return chunkBySize(text);
}
