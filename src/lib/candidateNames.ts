// Cheap, deterministic candidate-proper-noun detector for one chapter's
// already-tokenized lines. Inspired by trying vietphrase.app's "Nhận diện
// tên riêng (model offline)" panel directly on a live chapter (see the
// planning doc, section 15) -- that reference tool ships a real
// statistical/ML recognizer; this is a first-cut heuristic that reuses a
// signal the tokenizer already computes instead of re-implementing
// segmentation or shipping a model: a "hanviet_fallback" token means
// nothing in any dictionary/name/override table matched that character,
// and a real proper noun/place name tends to repeat many times in one
// chapter while a coincidental miss usually doesn't.
import type { DisplayToken } from "./tokenizer";

export interface CandidateName {
  chineseText: string;
  hanViet: string;
  occurrences: number;
  /** Capitalized Han-Viet reading -- the same quick-add default SpanEditor's HV field provides. */
  suggested: string;
}

const HAN_CHAR_RE = /\p{Script=Han}/u;

function capitalizeEachSyllable(text: string): string {
  return text
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export interface DetectCandidateNamesOptions {
  minOccurrences?: number;
  minLength?: number;
  maxResults?: number;
}

export function detectCandidateNames(
  lines: DisplayToken[][],
  { minOccurrences = 2, minLength = 2, maxResults = 30 }: DetectCandidateNamesOptions = {}
): CandidateName[] {
  const counts = new Map<string, { hanViet: string; occurrences: number }>();

  for (const line of lines) {
    let run: DisplayToken[] = [];
    const flushRun = () => {
      if (run.length === 0) return;
      const chineseText = run.map((t) => t.chinese).join("");
      if (chineseText.length >= minLength && HAN_CHAR_RE.test(chineseText)) {
        const hanViet = run.map((t) => t.hanViet).join(" ");
        const existing = counts.get(chineseText);
        if (existing) existing.occurrences += 1;
        else counts.set(chineseText, { hanViet, occurrences: 1 });
      }
      run = [];
    };
    for (const token of line) {
      if (token.source === "hanviet_fallback") {
        run.push(token);
      } else {
        flushRun();
      }
    }
    flushRun();
  }

  return [...counts.entries()]
    .map(([chineseText, { hanViet, occurrences }]) => ({
      chineseText,
      hanViet,
      occurrences,
      suggested: capitalizeEachSyllable(hanViet),
    }))
    .filter((c) => c.occurrences >= minOccurrences)
    .sort((a, b) => b.occurrences - a.occurrences || b.chineseText.length - a.chineseText.length)
    .slice(0, maxResults);
}
