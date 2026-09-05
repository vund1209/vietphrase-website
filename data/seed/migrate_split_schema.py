#!/usr/bin/env python3
"""
One-time migration: dictionary_seed.db from the old single-table
`dictionary_entries(category)` schema to separate `words` / `names` /
`pronouns` tables, matching the updated build_dictionary.py.

Why this exists as a separate script instead of just re-running
build_dictionary.py: that script reads from `ref/` (the cloned source
repos), which is intentionally not kept around (~375 MB, gitignored, see
docs/DICTIONARY_SOURCES.md). This migrates the already-merged data
in place, so re-cloning ref/ isn't required. If you DO re-clone ref/ and
rerun build_dictionary.py from scratch later, it now emits this same
schema directly and this script becomes unnecessary.

Safe to run once. Exits cleanly (no-op) if already migrated.
"""
import sqlite3
import unicodedata
from pathlib import Path

SEED_DIR = Path(__file__).parent
DB_PATH = SEED_DIR / "dictionary_seed.db"


def normalize_phrase(value: str) -> str:
    """Unicode-normalize (NFC) and trim, same as build_dictionary.py, so
    migrated data and freshly-built data use byte-consistent lookup keys."""
    return unicodedata.normalize("NFC", value).strip()


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='dictionary_entries'")
    if not cur.fetchone():
        print("No dictionary_entries table found -- already migrated, or unexpected schema. Nothing to do.")
        conn.close()
        return

    print("Reading existing dictionary_entries ...")
    cur.execute(
        "SELECT chinese_phrase, vietnamese_phrase, category, source, created_at "
        "FROM dictionary_entries ORDER BY id"
    )
    rows = cur.fetchall()
    print(f"  {len(rows)} rows loaded")

    cur.execute("DROP TABLE dictionary_entries")

    cur.execute("""
        CREATE TABLE words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chinese_phrase TEXT NOT NULL UNIQUE,
            vietnamese_phrase TEXT NOT NULL,
            phrase_length INTEGER NOT NULL,
            source TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cur.execute("CREATE INDEX idx_words_phrase_length ON words(phrase_length)")

    cur.execute("""
        CREATE TABLE names (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chinese_phrase TEXT NOT NULL,
            vietnamese_phrase TEXT NOT NULL,
            phrase_length INTEGER NOT NULL,
            novel_id INTEGER,
            source TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cur.execute("CREATE UNIQUE INDEX idx_names_global ON names(chinese_phrase) WHERE novel_id IS NULL")
    cur.execute("CREATE UNIQUE INDEX idx_names_scoped ON names(chinese_phrase, novel_id) WHERE novel_id IS NOT NULL")
    cur.execute("CREATE INDEX idx_names_phrase_length ON names(phrase_length)")
    cur.execute("CREATE INDEX idx_names_novel ON names(novel_id)")

    cur.execute("""
        CREATE TABLE pronouns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chinese_phrase TEXT NOT NULL UNIQUE,
            vietnamese_phrase TEXT NOT NULL,
            phrase_length INTEGER NOT NULL,
            source TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    dest_lists = {"word": [], "name": [], "pronoun": []}
    unknown_category = 0
    dropped_empty = 0
    for chinese, vietnamese, category, source, created_at in rows:
        if category not in dest_lists:
            unknown_category += 1
            continue
        zh = normalize_phrase(chinese)
        vi = normalize_phrase(vietnamese)
        if not zh:
            dropped_empty += 1
            continue
        dest_lists[category].append((zh, vi, len(zh), source, created_at))

    cur.executemany(
        "INSERT OR IGNORE INTO words (chinese_phrase, vietnamese_phrase, phrase_length, source, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        dest_lists["word"],
    )
    cur.executemany(
        "INSERT OR IGNORE INTO names (chinese_phrase, vietnamese_phrase, phrase_length, source, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        [(zh, vi, ln, src, ts, ts) for zh, vi, ln, src, ts in dest_lists["name"]],
    )
    cur.executemany(
        "INSERT OR IGNORE INTO pronouns (chinese_phrase, vietnamese_phrase, phrase_length, source, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        dest_lists["pronoun"],
    )
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM words")
    words_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM names")
    names_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM pronouns")
    pronouns_count = cur.fetchone()[0]

    print(f"[migrate] source rows by category: "
          f"word={len(dest_lists['word'])} name={len(dest_lists['name'])} pronoun={len(dest_lists['pronoun'])}")
    print(f"[migrate] final table counts: words={words_count} names={names_count} pronouns={pronouns_count}")
    print(f"[migrate] dropped: {dropped_empty} empty-key rows, {unknown_category} unrecognized-category rows")
    if len(dest_lists["word"]) != words_count:
        print(f"[migrate] NOTE: {len(dest_lists['word']) - words_count} word rows collapsed as post-NFC-normalization duplicates")
    if len(dest_lists["name"]) != names_count:
        print(f"[migrate] NOTE: {len(dest_lists['name']) - names_count} name rows collapsed as post-NFC-normalization duplicates")
    if len(dest_lists["pronoun"]) != pronouns_count:
        print(f"[migrate] NOTE: {len(dest_lists['pronoun']) - pronouns_count} pronoun rows collapsed as post-NFC-normalization duplicates")

    cur.execute("VACUUM")
    conn.close()
    print("Migration complete ->", DB_PATH)


if __name__ == "__main__":
    main()
