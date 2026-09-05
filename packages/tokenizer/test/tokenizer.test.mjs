import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { VietPhraseTokenizer } from "../src/tokenizer.mjs";

// Builds a small, self-contained test database per test (not the real
// dictionary_seed.db) so these unit tests are fast, deterministic, and
// independent of future changes to the real dataset. See
// tokenizer.real-data.test.mjs for the real-data spot checks.
function buildTestDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "vp-tokenizer-test-"));
  const dbPath = path.join(dir, "test.db");
  const setup = new DatabaseSync(dbPath);
  setup.exec(`
    CREATE TABLE words (chinese_phrase TEXT, vietnamese_phrase TEXT, phrase_length INTEGER);
    CREATE TABLE names (chinese_phrase TEXT, vietnamese_phrase TEXT, phrase_length INTEGER, novel_id INTEGER);
    CREATE TABLE pronouns (chinese_phrase TEXT, vietnamese_phrase TEXT, phrase_length INTEGER);
    CREATE TABLE hanviet_fallback (chinese_char TEXT, hanviet_readings TEXT);
  `);
  const insertWord = setup.prepare("INSERT INTO words VALUES (?, ?, ?)");
  const insertName = setup.prepare("INSERT INTO names VALUES (?, ?, ?, ?)");
  const insertPronoun = setup.prepare("INSERT INTO pronouns VALUES (?, ?, ?)");
  const insertHv = setup.prepare("INSERT INTO hanviet_fallback VALUES (?, ?)");

  // Reproduces the real 他/自己 situation found during prototype
  // validation: the same phrase exists in both `words` (messier,
  // multi-sense) and `pronouns` (clean, curated).
  insertWord.run("他", "hắn/nó/khác", 1);
  insertPronoun.run("他", "hắn", 1);
  insertWord.run("自己的人生", "nhân sinh của mình", 5);
  insertPronoun.run("自己", "tự mình/chính mình", 2);

  insertWord.run("测试", "kiểm tra/thử nghiệm", 2);

  insertHv.run("龘", "đạp");
  // deliberately no entry anywhere for "龘" 's neighbor char used below

  // Per-character Han-Viet readings for "测试", independent of (and
  // deliberately different in wording from) its "word" table entry
  // above -- exercises hanViet being computed separately from
  // vietnamese even for a matched (non-fallback) token.
  insertHv.run("测", "trắc");
  insertHv.run("试", "thí/thử");

  insertName.run("萧炎", "Tiêu Viêm", 2, null); // global

  setup.close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("pronoun beats word at the same match length", () => {
  const { dbPath, cleanup } = buildTestDb();
  const tok = new VietPhraseTokenizer(dbPath);
  const tokens = tok.tokenize("他");
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].source, "pronoun");
  assert.equal(tokens[0].vietnamese, "hắn");
  tok.close();
  cleanup();
});

test("longest match wins over a shorter, higher-priority match", () => {
  const { dbPath, cleanup } = buildTestDb();
  const tok = new VietPhraseTokenizer(dbPath);
  const tokens = tok.tokenize("自己的人生");
  assert.equal(tokens.length, 1, "should be one 5-char word match, not a 2-char pronoun match plus fallback");
  assert.equal(tokens[0].source, "word");
  assert.equal(tokens[0].chinese, "自己的人生");
  tok.close();
  cleanup();
});

test("per-novel override (Postgres-shaped Map) beats the global SQLite name", () => {
  const { dbPath, cleanup } = buildTestDb();
  const tok = new VietPhraseTokenizer(dbPath);
  const overrides = new Map([["萧炎", "Viêm Nhi"]]);
  assert.equal(tok.tokenize("萧炎", { overrides })[0].vietnamese, "Viêm Nhi");
  // A novel with no override for this phrase (empty or unrelated Map)
  // falls back to the global SQLite name, same as passing none at all.
  assert.equal(tok.tokenize("萧炎", { overrides: new Map() })[0].vietnamese, "Tiêu Viêm");
  assert.equal(tok.tokenize("萧炎")[0].vietnamese, "Tiêu Viêm");
  tok.close();
  cleanup();
});

test("override longer than any SQLite entry still wins the longest-match scan", () => {
  const { dbPath, cleanup } = buildTestDb();
  const tok = new VietPhraseTokenizer(dbPath);
  // Longest phrase in the seeded test db is 5 chars ("自己的人生"); this
  // override is 6, checking that the scan window grows to cover it.
  const overrides = new Map([["自己的人生啊", "ôi nhân sinh của mình"]]);
  const tokens = tok.tokenize("自己的人生啊", { overrides });
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].source, "name");
  assert.equal(tokens[0].vietnamese, "ôi nhân sinh của mình");
  tok.close();
  cleanup();
});

test("falls back to single-char Han-Viet reading when no phrase-table entry exists", () => {
  const { dbPath, cleanup } = buildTestDb();
  const tok = new VietPhraseTokenizer(dbPath);
  const tokens = tok.tokenize("龘");
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].source, "hanviet_fallback");
  assert.equal(tokens[0].vietnamese, "đạp");
  tok.close();
  cleanup();
});

test("passes an unmatched character through raw when nothing matches at all", () => {
  const { dbPath, cleanup } = buildTestDb();
  const tok = new VietPhraseTokenizer(dbPath);
  const tokens = tok.tokenize("龍"); // not seeded anywhere in this test db
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].source, "unmatched");
  assert.equal(tokens[0].vietnamese, "龍");
  tok.close();
  cleanup();
});

test("defaults to the first '/'-separated alternative but preserves the raw value", () => {
  const { dbPath, cleanup } = buildTestDb();
  const tok = new VietPhraseTokenizer(dbPath);
  const tokens = tok.tokenize("测试");
  assert.equal(tokens[0].vietnamese, "kiểm tra");
  assert.equal(tokens[0].rawVietnamese, "kiểm tra/thử nghiệm");
  tok.close();
  cleanup();
});

test("pickAlternative is pluggable", () => {
  const { dbPath, cleanup } = buildTestDb();
  const tok = new VietPhraseTokenizer(dbPath, {
    pickAlternative: (alts) => alts.split("/").pop(),
  });
  const tokens = tok.tokenize("测试");
  assert.equal(tokens[0].vietnamese, "thử nghiệm");
  tok.close();
  cleanup();
});


test("every token carries a hanViet reading, independent of vietnamese", () => {
  const { dbPath, cleanup } = buildTestDb();
  const tok = new VietPhraseTokenizer(dbPath);
  const tokens = tok.tokenize("测试");
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].vietnamese, "kiểm tra");
  // Per-character reading, joined with a space -- not the phrase-table
  // translation above, and not required to match it.
  assert.equal(tokens[0].hanViet, "trắc thí");
  tok.close();
  cleanup();
});

test("hanViet falls back to the raw character when it has no reading on file", () => {
  const { dbPath, cleanup } = buildTestDb();
  const tok = new VietPhraseTokenizer(dbPath);
  // "萧炎" matches the global `names` table but neither character has a
  // hanviet_fallback row in this test db.
  const tokens = tok.tokenize("萧炎");
  assert.equal(tokens[0].vietnamese, "Tiêu Viêm");
  assert.equal(tokens[0].hanViet, "萧 炎");
  tok.close();
  cleanup();
});

test("hanViet's per-character reading respects pickAlternative too", () => {
  const { dbPath, cleanup } = buildTestDb();
  const tok = new VietPhraseTokenizer(dbPath, {
    pickAlternative: (alts) => alts.split("/").pop(),
  });
  const tokens = tok.tokenize("测试");
  assert.equal(tokens[0].hanViet, "trắc thử");
  tok.close();
  cleanup();
});

test("hanViet for a genuinely unmatched character equals its fallback reading (or itself)", () => {
  const { dbPath, cleanup } = buildTestDb();
  const tok = new VietPhraseTokenizer(dbPath);
  const fallbackToken = tok.tokenize("龘")[0];
  assert.equal(fallbackToken.source, "hanviet_fallback");
  assert.equal(fallbackToken.vietnamese, "đạp");
  assert.equal(fallbackToken.hanViet, "đạp");

  const unmatchedToken = tok.tokenize("龍")[0];
  assert.equal(unmatchedToken.source, "unmatched");
  assert.equal(unmatchedToken.hanViet, "龍");
  tok.close();
  cleanup();
});
