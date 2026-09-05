// Throwaway validation prototype for the longest-match tokenizer described
// in docs/VIETPHRASE_CORE.md -- NOT the production implementation. Goal:
// confirm the merged dictionary actually produces readable output before
// investing in the real Next.js app / UI around it.
//
// Zero dependencies: uses Node's built-in (experimental) `node:sqlite`
// directly against data/seed/dictionary_seed.db. Run with:
//   node prototype/tokenizer.mjs
//
// Implements the algorithm exactly as documented: at each position, try
// match lengths from longest to shortest; at each length, check
// names(global) -> pronouns -> words in that priority order (pronouns
// BEFORE words -- an earlier word>pronoun order was tried first and shown
// to be wrong, see docs/VIETPHRASE_CORE.md "corrected after testing");
// the first hit at the LONGEST length wins (longest-match beats category
// priority; category priority only breaks same-length ties). Falls back
// to a single Han-Viet character reading, then to the raw character, if
// nothing matches. Per-novel name scoping is not exercised here (no
// novel_id data to test against yet) -- only the global fallback path.
//
// Alternate translations (the `a/b/c` format) default to the FIRST option,
// per the open decision noted in VIETPHRASE_CORE.md.

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "seed", "dictionary_seed.db");

const db = new DatabaseSync(DB_PATH, { readOnly: true });

const stmtNameGlobal = db.prepare(
  "SELECT vietnamese_phrase FROM names WHERE chinese_phrase = ? AND novel_id IS NULL"
);
const stmtWord = db.prepare(
  "SELECT vietnamese_phrase FROM words WHERE chinese_phrase = ?"
);
const stmtPronoun = db.prepare(
  "SELECT vietnamese_phrase FROM pronouns WHERE chinese_phrase = ?"
);
const stmtHanviet = db.prepare(
  "SELECT hanviet_readings FROM hanviet_fallback WHERE chinese_char = ?"
);

const maxLenRow = db
  .prepare(
    "SELECT MAX(len) AS m FROM (" +
      "SELECT MAX(phrase_length) AS len FROM names " +
      "UNION SELECT MAX(phrase_length) FROM words" +
      ")"
  )
  .get();
const MAX_LEN = maxLenRow.m;

function firstAlt(value) {
  return value.split("/")[0];
}

// Returns { table, chinese, vietnamese } for the longest match starting at
// `pos` in `text`, or null if nothing matched (caller falls back to
// single-char Han-Viet / raw char).
function longestMatchAt(text, pos) {
  const remaining = text.length - pos;
  const upper = Math.min(MAX_LEN, remaining);
  for (let len = upper; len >= 1; len--) {
    const candidate = text.slice(pos, pos + len);

    const nameRow = stmtNameGlobal.get(candidate);
    if (nameRow) return { table: "name", chinese: candidate, vietnamese: nameRow.vietnamese_phrase };

    const pronounRow = stmtPronoun.get(candidate);
    if (pronounRow) return { table: "pronoun", chinese: candidate, vietnamese: pronounRow.vietnamese_phrase };

    const wordRow = stmtWord.get(candidate);
    if (wordRow) return { table: "word", chinese: candidate, vietnamese: wordRow.vietnamese_phrase };
  }
  return null;
}

function tokenize(text) {
  const tokens = [];
  let pos = 0;
  while (pos < text.length) {
    const match = longestMatchAt(text, pos);
    if (match) {
      tokens.push({
        source: match.table,
        chinese: match.chinese,
        vietnamese: firstAlt(match.vietnamese),
        rawVietnamese: match.vietnamese,
      });
      pos += match.chinese.length;
      continue;
    }
    const ch = text[pos];
    const hv = stmtHanviet.get(ch);
    if (hv) {
      tokens.push({
        source: "hanviet_fallback",
        chinese: ch,
        vietnamese: firstAlt(hv.hanviet_readings),
        rawVietnamese: hv.hanviet_readings,
      });
    } else {
      tokens.push({ source: "UNMATCHED", chinese: ch, vietnamese: ch, rawVietnamese: ch });
    }
    pos += 1;
  }
  return tokens;
}

// Synthetic test paragraph (written for this test, not copied from any
// real novel) -- deliberately mixes: known names (萧炎, 唐三), common
// multi-char words already spot-checked in earlier sessions, pronouns
// (他, 自己), and a Chinese date pattern (2006年08月24日) that the
// grammar-reorder pass (not implemented yet) would normally handle.
const sample =
  "萧炎缓缓睁开双眼，看着这片熟悉的天空，心中涌起一丝感慨。" +
  "他与唐三曾在这里学习多年，那些时光如今回忆起来，依旧清晰。" +
  "2006年08月24日，他们初次相遇，那一天，天空湛蓝，他知道，自己的人生，将因此而改变。";

console.log(`MAX_LEN (scan window) = ${MAX_LEN}`);
console.log(`Input (${sample.length} chars):\n${sample}\n`);

const tokens = tokenize(sample);

console.log("Token breakdown:");
console.log("-".repeat(72));
for (const t of tokens) {
  const altNote = t.rawVietnamese.includes("/") ? `  [alts: ${t.rawVietnamese}]` : "";
  console.log(`${t.source.padEnd(16)} ${t.chinese.padEnd(8)} -> ${t.vietnamese}${altNote}`);
}
console.log("-".repeat(72));

const assembled = tokens.map((t) => t.vietnamese).join(" ");
console.log("\nAssembled (naive space-joined) output:\n" + assembled);

const unmatched = tokens.filter((t) => t.source === "UNMATCHED");
console.log(`\nUnmatched characters: ${unmatched.length} ${unmatched.length ? "-> " + unmatched.map((t) => t.chinese).join("") : ""}`);

const bySource = {};
for (const t of tokens) bySource[t.source] = (bySource[t.source] || 0) + 1;
console.log("Token source breakdown:", bySource);

db.close();
