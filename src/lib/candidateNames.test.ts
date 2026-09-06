import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCandidateNames } from "./candidateNames.ts";
import type { DisplayToken } from "./tokenizer.ts";

// Builds a minimal fixture token -- only the fields detectCandidateNames
// actually reads (source, chinese, hanViet) matter for these tests.
function tok(chinese: string, hanViet: string, source: DisplayToken["source"] = "word"): DisplayToken {
  return { chinese, vietnamese: chinese, rawVietnamese: chinese, source, hanViet, capStyle: "NONE" };
}

test("merges consecutive hanviet_fallback tokens into one candidate", () => {
  const lines: DisplayToken[][] = [
    [tok("张", "trương", "hanviet_fallback"), tok("宇", "vũ", "hanviet_fallback"), tok("格", "cách", "hanviet_fallback")],
  ];
  const [candidate] = detectCandidateNames(lines, { minOccurrences: 1 });
  assert.equal(candidate.chineseText, "张宇格");
  assert.equal(candidate.hanViet, "trương vũ cách");
  assert.equal(candidate.suggested, "Trương Vũ Cách");
});

test("a dictionary-matched token in the middle splits one run into two", () => {
  const lines: DisplayToken[][] = [
    [
      tok("张", "trương", "hanviet_fallback"),
      tok("的", "de", "word"), // matched -- breaks the run
      tok("格", "cách", "hanviet_fallback"),
    ],
  ];
  const candidates = detectCandidateNames(lines, { minOccurrences: 1, minLength: 1 });
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map((c) => c.chineseText).sort(), ["张", "格"]);
});

test("counts occurrences of the same candidate across multiple lines", () => {
  const name = [tok("张", "trương", "hanviet_fallback"), tok("宇", "vũ", "hanviet_fallback")];
  const lines: DisplayToken[][] = [name, [tok("他", "tha", "word")], name];
  const [candidate] = detectCandidateNames(lines, { minOccurrences: 1 });
  assert.equal(candidate.occurrences, 2);
});

test("filters out candidates below the minOccurrences threshold", () => {
  const lines: DisplayToken[][] = [
    [tok("张", "trương", "hanviet_fallback"), tok("宇", "vũ", "hanviet_fallback")],
  ];
  const candidates = detectCandidateNames(lines, { minOccurrences: 2 });
  assert.equal(candidates.length, 0);
});

test("filters out single-character runs by default (minLength)", () => {
  const lines: DisplayToken[][] = [[tok("张", "trương", "hanviet_fallback")]];
  const candidates = detectCandidateNames(lines, { minOccurrences: 1 });
  assert.equal(candidates.length, 0);
});

test("ignores a run with no Han characters at all (defensive -- punctuation is tagged 'unmatched', not 'hanviet_fallback', but guard anyway)", () => {
  const lines: DisplayToken[][] = [
    [tok("12", "12", "hanviet_fallback"), tok("34", "34", "hanviet_fallback")],
  ];
  const candidates = detectCandidateNames(lines, { minOccurrences: 1 });
  assert.equal(candidates.length, 0);
});

test("sorts by occurrence count descending", () => {
  const rare = [tok("甲", "giáp", "hanviet_fallback"), tok("乙", "ất", "hanviet_fallback")];
  const common = [tok("丙", "bính", "hanviet_fallback"), tok("丁", "đinh", "hanviet_fallback")];
  const lines: DisplayToken[][] = [rare, common, common];
  const candidates = detectCandidateNames(lines, { minOccurrences: 1 });
  assert.equal(candidates[0].chineseText, "丙丁");
  assert.equal(candidates[0].occurrences, 2);
  assert.equal(candidates[1].chineseText, "甲乙");
  assert.equal(candidates[1].occurrences, 1);
});

test("respects maxResults", () => {
  const lines: DisplayToken[][] = [
    [tok("甲", "giáp", "hanviet_fallback"), tok("乙", "ất", "hanviet_fallback")],
    [tok("丙", "bính", "hanviet_fallback"), tok("丁", "đinh", "hanviet_fallback")],
  ];
  const candidates = detectCandidateNames(lines, { minOccurrences: 1, maxResults: 1 });
  assert.equal(candidates.length, 1);
});
