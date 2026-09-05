/**
 * VietPhrase longest-match tokenizer.
 *
 * Implements the algorithm specified in docs/VIETPHRASE_CORE.md: at each
 * position, try match lengths from longest to shortest; at each length,
 * check overrides(per-novel) -> names(global) -> pronouns -> words, in
 * that priority order; the first hit at the LONGEST length wins
 * (longest-match beats category priority; category priority only breaks
 * same-length ties). Falls back to a single Han-Viet character reading,
 * then the raw character, if nothing matches at all.
 *
 * This is the production module, promoted from prototype/tokenizer.mjs
 * after that prototype found and fixed two real bugs (a pronoun-priority
 * inversion, and numeral/date junk that had leaked into `words`) -- see
 * VIETPHRASE_CORE.md "Validation" for that history.
 *
 * Data sources, per docs/ARCHITECTURE.md "Data split" (2026-09-05): the
 * bulk dictionary (names/pronouns/words/hanviet_fallback) reads directly
 * from a dictionary_seed.db-shaped SQLite file via the built-in, still-
 * experimental `node:sqlite` -- this is not an interim measure, it's the
 * permanent design, since that data is static and duplicating it into
 * Postgres would blow a free-tier storage budget for no benefit. Only
 * per-novel Name overrides live in Postgres; the caller is responsible
 * for fetching those (one query per chapter translation, not one per
 * substring -- see ARCHITECTURE.md) and passing them in as the
 * `overrides` map on each `tokenize()` call. This module never talks to
 * Postgres/Prisma itself.
 *
 * Open decisions this module takes a stance on for now, tracked in
 * VIETPHRASE_CORE.md "Open decisions" -- revisit before relying on the
 * defaults in production:
 *   - alternate-translation selection defaults to the first `/`-separated
 *     option (pickAlternative is pluggable if that's wrong).
 *   - the scan window defaults to the true MAX(phrase_length) across
 *     names/words, which is correct but not necessarily fast at scale
 *     (maxScanLength is overridable).
 */
import { DatabaseSync } from "node:sqlite";

/**
 * @typedef {"name"|"pronoun"|"word"|"hanviet_fallback"|"unmatched"} TokenSource
 */

/**
 * @typedef {Object} Token
 * @property {TokenSource} source
 * @property {string} chinese - the matched (or single unmatched) substring
 * @property {string} vietnamese - the chosen alternative, per pickAlternative
 * @property {string} rawVietnamese - the full stored value, possibly "a/b/c"
 * @property {string} hanViet - the character-by-character Sino-Vietnamese
 *   reading of `chinese`, independent of `vietnamese` (which is the
 *   contextual VietPhrase substitution, often a real phrase/name rather
 *   than a literal reading). Always populated, for every token, not just
 *   the "hanviet_fallback"/"unmatched" sources -- lets a reader compare
 *   the literal reading against the contextual translation for any word.
 */

/**
 * @typedef {Object} TokenizerOptions
 * @property {(alternatives: string) => string} [pickAlternative]
 *   Selects which `/`-separated alternative to emit when an entry stores
 *   several. Defaults to the first one -- an intentional placeholder, not
 *   a considered default; see VIETPHRASE_CORE.md "Alternate translations".
 * @property {number} [maxScanLength]
 *   Caps the longest-match scan window. Defaults to the true
 *   MAX(phrase_length) found in the database.
 */

/**
 * @typedef {Object} TokenizeContext
 * @property {Map<string, string>} [overrides]
 *   Per-novel Name overrides, chinese phrase -> raw vietnamese value
 *   (same "a/b/c" alternatives format as the SQLite tables, run through
 *   the same pickAlternative). Checked before the SQLite global names
 *   table at every candidate match length. Build this from Postgres's
 *   `Name` rows for the current novel (one query per chapter
 *   translation), not from a per-substring lookup -- see
 *   docs/ARCHITECTURE.md "Data split". Omit (or pass an empty Map) for
 *   global-only resolution, e.g. the standalone translate page which has
 *   no novel context at all.
 */

export class VietPhraseTokenizer {
  /**
   * @param {string} dbPath - path to a dictionary_seed.db-schema SQLite file
   * @param {TokenizerOptions} [options]
   */
  constructor(dbPath, options = {}) {
    this.db = new DatabaseSync(dbPath, { readOnly: true });
    this.pickAlternative = options.pickAlternative ?? ((alts) => alts.split("/")[0]);

    // Global only: novel-scoped Name overrides now live in Postgres, not
    // here (see docs/ARCHITECTURE.md "Data split"). The `novel_id IS
    // NULL` filter is kept as a defensive check, not because this table
    // is expected to ever contain non-null rows going forward.
    this._stmtNameGlobal = this.db.prepare(
      "SELECT vietnamese_phrase FROM names WHERE chinese_phrase = ? AND novel_id IS NULL"
    );
    this._stmtPronoun = this.db.prepare(
      "SELECT vietnamese_phrase FROM pronouns WHERE chinese_phrase = ?"
    );
    this._stmtWord = this.db.prepare(
      "SELECT vietnamese_phrase FROM words WHERE chinese_phrase = ?"
    );
    this._stmtHanviet = this.db.prepare(
      "SELECT hanviet_readings FROM hanviet_fallback WHERE chinese_char = ?"
    );

    const row = this.db
      .prepare(
        "SELECT MAX(len) AS m FROM (" +
          "SELECT MAX(phrase_length) AS len FROM names " +
          "UNION SELECT MAX(phrase_length) FROM words" +
          ")"
      )
      .get();
    this.maxScanLength = options.maxScanLength ?? row.m ?? 1;
  }

  /**
   * @param {string} text
   * @param {TokenizeContext} [context]
   * @returns {Token[]}
   */
  tokenize(text, context = {}) {
    const overrides = context.overrides;
    // Overrides aren't known at construction time (they're per-novel,
    // fetched by the caller per chapter), so the effective scan window
    // has to account for them per call, not just at construction. Cheap:
    // overrides are expected to be a few hundred rows at most.
    const effectiveMax = overrides && overrides.size
      ? Math.max(this.maxScanLength, ...Array.from(overrides.keys(), (k) => k.length))
      : this.maxScanLength;

    const tokens = [];
    let pos = 0;
    while (pos < text.length) {
      const match = this._longestMatchAt(text, pos, overrides, effectiveMax);
      if (match) {
        tokens.push(this._toToken(match.source, match.chinese, match.vietnamese));
        pos += match.chinese.length;
        continue;
      }
      const ch = text[pos];
      const hv = this._stmtHanviet.get(ch);
      tokens.push(
        hv
          ? this._toToken("hanviet_fallback", ch, hv.hanviet_readings)
          : this._toToken("unmatched", ch, ch)
      );
      pos += 1;
    }
    return tokens;
  }

  /** @private */
  _toToken(source, chinese, rawVietnamese) {
    return {
      source,
      chinese,
      vietnamese: this.pickAlternative(rawVietnamese),
      rawVietnamese,
      hanViet: this._hanVietFor(chinese),
    };
  }

  /**
   * Character-by-character Sino-Vietnamese reading of `text`, via the
   * same `hanviet_fallback` table used for genuinely unmatched
   * characters -- but called for every token here, not just those,
   * since a reader comparing "the literal reading" vs "the phrase
   * VietPhrase chose" is useful for any matched name/pronoun/word too,
   * not only fallback characters. Falls back to the raw character for
   * any character with no reading on file (rare -- `hanviet_fallback`
   * is built to cover the common CJK range, see
   * `data/seed/build_dictionary.py`).
   * @private
   */
  _hanVietFor(text) {
    let result = "";
    for (const ch of text) {
      const hv = this._stmtHanviet.get(ch);
      const reading = hv ? this.pickAlternative(hv.hanviet_readings) : ch;
      result += result ? ` ${reading}` : reading;
    }
    return result;
  }

  /** @private */
  _longestMatchAt(text, pos, overrides, effectiveMax) {
    const remaining = text.length - pos;
    const upper = Math.min(effectiveMax, remaining);
    for (let len = upper; len >= 1; len--) {
      const candidate = text.slice(pos, pos + len);

      if (overrides && overrides.has(candidate)) {
        return { source: "name", chinese: candidate, vietnamese: overrides.get(candidate) };
      }

      const globalName = this._stmtNameGlobal.get(candidate);
      if (globalName) {
        return { source: "name", chinese: candidate, vietnamese: globalName.vietnamese_phrase };
      }

      const pronoun = this._stmtPronoun.get(candidate);
      if (pronoun) {
        return { source: "pronoun", chinese: candidate, vietnamese: pronoun.vietnamese_phrase };
      }

      const word = this._stmtWord.get(candidate);
      if (word) {
        return { source: "word", chinese: candidate, vietnamese: word.vietnamese_phrase };
      }
    }
    return null;
  }

  close() {
    this.db.close();
  }
}
