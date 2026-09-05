/**
 * VietPhrase longest-match tokenizer.
 *
 * Implements the algorithm specified in docs/VIETPHRASE_CORE.md: at each
 * position, try match lengths from longest to shortest; at each length,
 * check names(novel) -> names(global) -> pronouns -> words, in that
 * priority order; the first hit at the LONGEST length wins (longest-match
 * beats category priority; category priority only breaks same-length
 * ties). Falls back to a single Han-Viet character reading, then the raw
 * character, if nothing matches at all.
 *
 * This is the production module, promoted from prototype/tokenizer.mjs
 * after that prototype found and fixed two real bugs (a pronoun-priority
 * inversion, and numeral/date junk that had leaked into `words`) -- see
 * VIETPHRASE_CORE.md "Validation" for that history. The public
 * tokenize() contract is deliberately data-source-agnostic in spirit,
 * even though the constructor currently only knows how to read a
 * dictionary_seed.db-shaped SQLite file directly (via the built-in,
 * still-experimental `node:sqlite`) -- once the live app has a Postgres
 * database (see prisma/schema.prisma), swap the lookup statements for
 * Prisma queries without changing what tokenize() returns.
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

export class VietPhraseTokenizer {
  /**
   * @param {string} dbPath - path to a dictionary_seed.db-schema SQLite file
   * @param {TokenizerOptions} [options]
   */
  constructor(dbPath, options = {}) {
    this.db = new DatabaseSync(dbPath, { readOnly: true });
    this.pickAlternative = options.pickAlternative ?? ((alts) => alts.split("/")[0]);

    this._stmtNameScoped = this.db.prepare(
      "SELECT vietnamese_phrase FROM names WHERE chinese_phrase = ? AND novel_id = ?"
    );
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
   * @param {{novelId?: number}} [context]
   *   novelId scopes `names` lookups to that novel first, falling back to
   *   the global name if the novel has no override. Omit for global-only
   *   resolution. See VIETPHRASE_CORE.md "Per-novel name resolution".
   * @returns {Token[]}
   */
  tokenize(text, context = {}) {
    const tokens = [];
    let pos = 0;
    while (pos < text.length) {
      const match = this._longestMatchAt(text, pos, context.novelId);
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
    return { source, chinese, vietnamese: this.pickAlternative(rawVietnamese), rawVietnamese };
  }

  /** @private */
  _longestMatchAt(text, pos, novelId) {
    const remaining = text.length - pos;
    const upper = Math.min(this.maxScanLength, remaining);
    for (let len = upper; len >= 1; len--) {
      const candidate = text.slice(pos, pos + len);

      if (novelId != null) {
        const scoped = this._stmtNameScoped.get(candidate, novelId);
        if (scoped) {
          return { source: "name", chinese: candidate, vietnamese: scoped.vietnamese_phrase };
        }
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
