import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VietPhraseTokenizer } from "../src/tokenizer.mjs";

// Lightweight regression check against the REAL dictionary_seed.db,
// separate from tokenizer.test.mjs's isolated unit tests. This exists to
// catch the actual bugs this module was built to fix if a future data
// rebuild reintroduces them -- not to re-validate the algorithm itself.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "..", "..", "data", "seed", "dictionary_seed.db");

test("real data: known names resolve correctly", () => {
  const tok = new VietPhraseTokenizer(DB_PATH);
  assert.equal(tok.tokenize("萧炎")[0].vietnamese, "Tiêu Viêm");
  assert.equal(tok.tokenize("唐三")[0].vietnamese, "Đường Tam");
  tok.close();
});

test("real data: common pronouns resolve via the pronoun table, not the messier word entry", () => {
  const tok = new VietPhraseTokenizer(DB_PATH);
  assert.equal(tok.tokenize("他")[0].source, "pronoun");
  assert.equal(tok.tokenize("他们")[0].source, "pronoun");
  tok.close();
});

test("real data: numeral/date junk was cleaned out of words (regression guard)", () => {
  const tok = new VietPhraseTokenizer(DB_PATH);
  // These were confirmed-removed literal junk entries; if a future
  // rebuild reintroduces them without the chapter/number-artifact filter,
  // this catches it.
  const tokens = tok.tokenize("2013年10月27日");
  const wholeDateMatchedAsOneToken = tokens.length === 1;
  assert.equal(wholeDateMatchedAsOneToken, false, "a literal date entry leaked back into words");
  tok.close();
});
