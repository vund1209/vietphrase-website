#!/usr/bin/env python3
"""
VietPhrase seed dictionary builder — v2

Merges phrase, name, pronoun, and Han-Viet fallback data from multiple
community sources into one clean SQLite database.

Expects the reference repos to be cloned under ../../ref relative to this
file (see docs/DICTIONARY_SOURCES.md for the exact `git clone` commands).

Run: python3 build_dictionary.py
Output: dictionary_seed.db (in this same folder)
"""
import ast
import csv
import re
import sqlite3
import unicodedata
from pathlib import Path

import opencc

SEED_DIR = Path(__file__).parent
REF_DIR = SEED_DIR.parent.parent / "ref"
OUT_DB = SEED_DIR / "dictionary_seed.db"

s2t = opencc.OpenCC("s2t")
t2s = opencc.OpenCC("t2s")

# ---------------------------------------------------------------------------
# Shared junk filtering for phrase/name dictionaries
# ---------------------------------------------------------------------------
JUNK_PATTERNS = [
    re.compile(r"www\.", re.I),
    re.compile(r"\.(com|net|cn|vn)\b", re.I),
    re.compile(r"txt8|zuilu|qidian|bqg\d*|zhulang|xbiquge|shumilou|feiku|zwdu|tianyabook", re.I),
    re.compile(r"未完待续|首发|本站域名|文字首发|同步阅读"),
]

# Patterns that mark an entry as a chapter-title / number-formatting
# artifact rather than a genuine proper noun (seen heavily in TienDich's
# Names.txt / Names2.txt, accumulated from real per-novel translation runs).
CHAPTER_JUNK_PATTERNS = [
    re.compile(r"^正文\s*\d+\s*$"),
    re.compile(r"^第?[0-9一二三四五六七八九十百千万零]+\s*[章节節回卷集幕折]$"),
    re.compile(r"^[0-9]+\s*(亿|億|万|萬|元|美元|块|個|个)"),
    # chapter labels combining multiple chapter numbers, e.g.
    # "第 1692+1693+1694 章" -- the plain-digit pattern above doesn't
    # allow "+"/","/spaces inside the number run, so this one does.
    re.compile(r"^第?[0-9+,、\-～~\s]+[章节節回卷集幕折]\s*$"),
    # full Chinese calendar dates, e.g. "2006年08月24日" / "2013 年 10 月 27 日"
    # (with or without spaces around each unit). These are one-off
    # translation-memory literals from real scraping runs, not general
    # dictionary content -- see "Kept as reference only" / rule.txt in
    # docs/DICTIONARY_SOURCES.md for the intended algorithmic replacement.
    re.compile(r"^\d{1,4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*[日号號]\s*$"),
]
CHAPTER_JUNK_VI_PATTERNS = [
    re.compile(r"^(Chương|Hồi|Chapter)\s*\d+", re.I),
    # date-shaped Vietnamese output, catches malformed Chinese-side keys
    # (e.g. a stray romanization typo replacing "日") that the Chinese-side
    # date pattern above would otherwise miss.
    re.compile(r"^(ngày|Ngày)\s+\d+\s+tháng", re.I),
    re.compile(r"^\d+\s+tháng.*năm\s+\d+", re.I),
]


def is_junk(chinese: str, vietnamese: str) -> bool:
    if not vietnamese.strip() or vietnamese.strip() in ("()", ""):
        return True
    combined = chinese + " " + vietnamese
    return any(p.search(combined) for p in JUNK_PATTERNS)


def is_number_unit_artifact(chinese: str) -> bool:
    """Catches the general "number + counter/calendar word" shape that
    CHAPTER_JUNK_PATTERNS' specific date/chapter regexes don't enumerate --
    e.g. "542年" (year, no month/day), "827两" (a weight), "4点钟" (a time),
    "40 公分左右" (a measurement). These are one-off translation-memory
    literals from a specific scraped novel, not general dictionary
    content -- the underlying number is unbounded, so no finite set of
    these will ever be complete (see docs/DICTIONARY_SOURCES.md on why
    Vietphrase_Number.txt/Vietphrase_Chapter.txt were excluded outright).

    Heuristic: the phrase starts with an ASCII digit, and everything
    that's left after removing digits and whitespace is short (<=6 chars)
    and entirely CJK. This deliberately does NOT flag digit-led phrases
    mixed with Latin letters/symbols (e.g. "5G网络", "3D打印", "4K电视"),
    since those are real terms, not open-ended number+unit combinations.
    """
    chinese = chinese.strip()
    if not chinese or not chinese[0].isdigit():
        return False
    remainder = [c for c in chinese if not (c.isdigit() or c.isspace())]
    if not remainder:
        return True  # pure number, e.g. a bare "1997" key
    if len(remainder) > 6:
        return False
    return all("\u4e00" <= c <= "\u9fff" for c in remainder)


def is_chapter_or_number_artifact(chinese: str, vietnamese: str) -> bool:
    chinese = chinese.strip()
    vietnamese = vietnamese.strip()
    if any(p.match(chinese) for p in CHAPTER_JUNK_PATTERNS):
        return True
    if any(p.match(vietnamese) for p in CHAPTER_JUNK_VI_PATTERNS):
        return True
    if is_number_unit_artifact(chinese):
        return True
    return False


def normalize_alternatives(value: str) -> str:
    """Different sources use '/' or '|' to separate alternative translations.
    Normalize everything to '/'."""
    value = value.replace("|", "/")
    # collapse accidental doubled separators / whitespace around them
    value = re.sub(r"\s*/\s*", "/", value)
    return value.strip()


def normalize_phrase(value: str) -> str:
    """Unicode-normalize (NFC) and trim so lookup keys are byte-consistent
    regardless of which source tool produced them."""
    return unicodedata.normalize("NFC", value).strip()


def read_lines_any_encoding(path: Path):
    """VietPhrase-family files show up in UTF-8, UTF-8 with BOM, and
    UTF-16LE depending on which tool exported them. Sniff and decode."""
    raw = path.read_bytes()
    if raw.startswith(b"\xff\xfe"):
        text = raw.decode("utf-16-le")
    elif raw.startswith(b"\xef\xbb\xbf"):
        text = raw.decode("utf-8-sig")
    else:
        text = raw.decode("utf-8", errors="replace")
    return text.splitlines()


# ---------------------------------------------------------------------------
# Generic phrase-dict parser (chinese=vietnamese, one per line)
# ---------------------------------------------------------------------------
def parse_phrase_dict(path: Path, label: str, filter_chapter_junk: bool = False):
    entries = {}
    skipped_junk = skipped_malformed = skipped_chapter = 0
    for line in read_lines_any_encoding(path):
        line = line.strip().strip("\ufeff")
        if not line or "=" not in line or line.startswith("#") or line.startswith("//"):
            skipped_malformed += 1
            continue
        chinese, _, vietnamese = line.partition("=")
        chinese = normalize_phrase(chinese)
        vietnamese = normalize_phrase(normalize_alternatives(vietnamese))
        if not chinese:
            skipped_malformed += 1
            continue
        if is_junk(chinese, vietnamese):
            skipped_junk += 1
            continue
        if filter_chapter_junk and is_chapter_or_number_artifact(chinese, vietnamese):
            skipped_chapter += 1
            continue
        entries.setdefault(chinese, vietnamese)
    print(f"[{label}] {len(entries)} unique entries "
          f"(skipped {skipped_junk} junk, {skipped_malformed} malformed, "
          f"{skipped_chapter} chapter/number artifacts)")
    return entries


# ---------------------------------------------------------------------------
# CVDICT (CEDICT format)
# ---------------------------------------------------------------------------
CEDICT_LINE_RE = re.compile(
    r"^(?P<trad>\S+)\s+(?P<simp>\S+)\s+\[(?P<pinyin>[^\]]*)\]\s+/(?P<defs>.+)/\s*$"
)


def clean_definition(defn: str) -> str:
    defn = re.split(r"[;/]", defn)[0]
    defn = re.sub(r"\([^)]*\)", "", defn)
    defn = re.sub(r"\s{2,}", " ", defn).strip(" ,.")
    return defn


def parse_cvdict(path: Path):
    entries = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            m = CEDICT_LINE_RE.match(line.strip())
            if not m:
                continue
            defs = m.group("defs").split("/")
            all_defs = "/".join(clean_definition(d) for d in defs if clean_definition(d))
            if not all_defs:
                continue
            for key in {normalize_phrase(m.group("trad")), normalize_phrase(m.group("simp"))}:
                if key and key not in entries:
                    entries[key] = all_defs
    print(f"[CVDICT] {len(entries)} unique entries")
    return entries


# ---------------------------------------------------------------------------
# hanviet-pinyin-wordlist CSV -> simplified+traditional keyed fallback
# ---------------------------------------------------------------------------
def parse_hanviet_pinyin_csv(path: Path):
    readings_by_char = {}
    with open(path, encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)
        for char, hanviet_raw, pinyin in reader:
            try:
                readings = ast.literal_eval(hanviet_raw)
            except (ValueError, SyntaxError):
                readings = []
            if not readings:
                continue
            readings_by_char.setdefault(char, [])
            for r in readings:
                if r not in readings_by_char[char]:
                    readings_by_char[char].append(r)

    final = {}
    for trad_char, readings in readings_by_char.items():
        final.setdefault(trad_char, [])
        for r in readings:
            if r not in final[trad_char]:
                final[trad_char].append(r)
        simp_char = t2s.convert(trad_char)
        if simp_char != trad_char:
            final.setdefault(simp_char, [])
            for r in readings:
                if r not in final[simp_char]:
                    final[simp_char].append(r)
    print(f"[hanviet-pinyin] {len(readings_by_char)} traditional chars -> {len(final)} keys")
    return final


# ---------------------------------------------------------------------------
# Simple single-char PhienAm files (char=reading, no pinyin disambiguation)
# used only to FILL GAPS the pinyin-based table above doesn't cover.
# ---------------------------------------------------------------------------
def parse_simple_phienam(path: Path, label: str):
    readings = {}
    for line in read_lines_any_encoding(path):
        line = line.strip().strip("\ufeff")
        if not line or "=" not in line:
            continue
        char, _, reading = line.partition("=")
        char = char.strip()
        reading = reading.strip()
        if len(char) != 1 or not reading:
            continue
        readings.setdefault(char, reading)
    print(f"[{label}] {len(readings)} single-char readings")
    return readings


# ---------------------------------------------------------------------------
# ThieuChuu.txt (classical dict): 字=reading1, reading2 [pinyin1|pinyin2]\n\t1. ...
# ---------------------------------------------------------------------------
def parse_thieuchuu(path: Path):
    readings = {}
    for line in read_lines_any_encoding(path):
        line = line.strip().strip("\ufeff")
        if not line or "=" not in line:
            continue
        char, _, rest = line.partition("=")
        char = char.strip()
        if len(char) != 1:
            continue
        # take everything before the first literal "\n" escape sequence or "["
        head = re.split(r"\\n|\[", rest, maxsplit=1)[0]
        first_reading = head.split(",")[0].strip()
        if first_reading:
            readings.setdefault(char, first_reading)
    print(f"[ThieuChuu] {len(readings)} single-char readings")
    return readings


# ---------------------------------------------------------------------------
# Blacklist / ignored-phrase files -> scrape_blacklist table
# (junk paragraphs/lines seen in real scraped novel text; useful for
# cleaning raw chapter text at scrape time, not part of the dictionary)
# ---------------------------------------------------------------------------
def parse_blacklist(path: Path, label: str):
    patterns = []
    for line in read_lines_any_encoding(path):
        line = line.strip().strip("\ufeff")
        if not line or line.startswith("#") or line.startswith("BLACKLIST") or line.startswith("//"):
            continue
        patterns.append(line)
    print(f"[{label}] {len(patterns)} blacklist patterns")
    return patterns


# ---------------------------------------------------------------------------
# Build database
# ---------------------------------------------------------------------------
def build_db(word_entries, name_entries, pronoun_entries, hanviet, blacklist_patterns, stats):
    if OUT_DB.exists():
        OUT_DB.unlink()
    conn = sqlite3.connect(OUT_DB)
    cur = conn.cursor()

    # `words`, `names`, and `pronouns` are separate tables rather than one
    # table with a `category` column: they differ in lifecycle and access
    # pattern. words/pronouns are bulk, rebuilt-from-source, effectively
    # read-only data. `names` is the table end users actually curate over
    # time, and the one that needs per-novel scoping (see `novel_id` below)
    # so a character's name can be overridden consistently within one novel
    # without touching the global fallback name.
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
            novel_id INTEGER,             -- NULL = global fallback name.
                                           -- Maps to novels.id in the live
                                           -- app DB; this seed ships no
                                           -- novels table, so every row
                                           -- here is global (novel_id NULL).
            source TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    # Partial unique indexes, not a single UNIQUE(chinese_phrase, novel_id):
    # SQL treats every NULL as distinct from every other NULL, so a plain
    # composite unique constraint would silently allow duplicate *global*
    # names. These two partial indexes instead enforce: at most one global
    # row per phrase, and at most one row per phrase within any given novel
    # (a different novel may still override the same phrase differently).
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

    cur.execute("""
        CREATE TABLE hanviet_fallback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chinese_char TEXT NOT NULL UNIQUE,
            hanviet_readings TEXT NOT NULL,
            source TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE scrape_blacklist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pattern TEXT NOT NULL UNIQUE,
            source TEXT NOT NULL
        )
    """)

    def insert_simple(table, entries_with_source):
        rows = [(zh, vi, len(zh), src) for zh, vi, src in entries_with_source]
        cur.executemany(
            f"INSERT OR IGNORE INTO {table} (chinese_phrase, vietnamese_phrase, phrase_length, source) "
            "VALUES (?, ?, ?, ?)",
            rows,
        )
        return len(rows)

    n = insert_simple("words", word_entries)
    print(f"[db] inserted {n} words rows")
    n = insert_simple("names", name_entries)
    print(f"[db] inserted {n} names rows (all global, novel_id NULL)")
    n = insert_simple("pronouns", pronoun_entries)
    print(f"[db] inserted {n} pronouns rows")

    hv_rows = [(char, ",".join(dict.fromkeys(readings)), src) for char, readings, src in hanviet]
    cur.executemany(
        "INSERT OR IGNORE INTO hanviet_fallback (chinese_char, hanviet_readings, source) VALUES (?, ?, ?)",
        hv_rows,
    )
    print(f"[db] inserted {len(hv_rows)} hanviet_fallback rows")

    bl_rows = [(p, src) for p, src in blacklist_patterns]
    cur.executemany(
        "INSERT OR IGNORE INTO scrape_blacklist (pattern, source) VALUES (?, ?)",
        bl_rows,
    )
    print(f"[db] inserted {len(bl_rows)} scrape_blacklist rows")

    conn.commit()
    cur.execute("SELECT COUNT(*) FROM words")
    words_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM names")
    names_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM pronouns")
    pronouns_count = cur.fetchone()[0]
    print(f"[db] final counts -> words={words_count} names={names_count} pronouns={pronouns_count}")
    conn.close()


if __name__ == "__main__":
    # ---- 1. Merge phrase dictionaries (priority order: first wins) -------
    phrase_sources = [
        (REF_DIR / "Vietphrase" / "data" / "Vietphrase.txt", "hoangtuantk/Vietphrase"),
        (REF_DIR / "TienDich" / "data" / "Vietphrase.txt", "TienDich"),
        (REF_DIR / "file-vietphrase" / "VietPhrase.txt", "file-vietphrase"),
        (SEED_DIR / "VietPhrase.truyencuatui.txt", "truyencuatui/VietPhrase"),
        (REF_DIR / "script-vietphrase-translator" / "Vietphrase.txt", "script-vietphrase-translator"),
    ]
    word_entries = []  # (zh, vi, source) - first source to claim a key wins
    seen_word_keys = set()
    for path, label in phrase_sources:
        if not path.exists():
            print(f"[skip] {label}: {path} not found")
            continue
        parsed = parse_phrase_dict(path, label, filter_chapter_junk=True)
        added = 0
        for zh, vi in parsed.items():
            if zh in seen_word_keys:
                continue
            seen_word_keys.add(zh)
            word_entries.append((zh, vi, label))
            added += 1
        print(f"  -> {added} new keys contributed by {label}")

    # CVDICT fills remaining gaps only
    cvdict_path = SEED_DIR / "CVDICT.u8"
    if cvdict_path.exists():
        cvdict = parse_cvdict(cvdict_path)
        added = 0
        for zh, vi in cvdict.items():
            if zh in seen_word_keys:
                continue
            seen_word_keys.add(zh)
            word_entries.append((zh, vi, "builtin_cvdict"))
            added += 1
        print(f"  -> {added} new keys contributed by CVDICT")

    # ---- 2. Merge Name dictionaries (with chapter/number junk filtering) -
    name_sources = [
        (REF_DIR / "script-vietphrase-translator" / "Names.txt", "script-vietphrase-translator"),
        (REF_DIR / "Vietphrase" / "data" / "Names.txt", "hoangtuantk/Vietphrase"),
        (REF_DIR / "file-vietphrase" / "Names.txt", "file-vietphrase"),
        (REF_DIR / "file-vietphrase" / "NamebaseR03.txt", "file-vietphrase/NamebaseR03"),
        (REF_DIR / "TienDich" / "data" / "Names2.txt", "TienDich/Names2"),
        (REF_DIR / "TienDich" / "data" / "Names.txt", "TienDich/Names"),
    ]
    name_entries = []
    seen_name_keys = set()
    for path, label in name_sources:
        if not path.exists():
            print(f"[skip] {label}: {path} not found")
            continue
        parsed = parse_phrase_dict(path, label, filter_chapter_junk=True)
        added = 0
        for zh, vi in parsed.items():
            if zh in seen_name_keys:
                continue
            seen_name_keys.add(zh)
            name_entries.append((zh, vi, label))
            added += 1
        print(f"  -> {added} new keys contributed by {label}")

    # ---- 3. Merge Pronoun dictionaries ------------------------------------
    pronoun_sources = [
        (REF_DIR / "script-vietphrase-translator" / "Pronouns.txt", "script-vietphrase-translator"),
        (REF_DIR / "TienDich" / "data" / "Pronouns.txt", "TienDich"),
        (REF_DIR / "Vietphrase" / "data" / "DaiTuNhanXung.txt", "hoangtuantk/DaiTuNhanXung"),
    ]
    pronoun_entries = []
    seen_pronoun_keys = set()
    for path, label in pronoun_sources:
        if not path.exists():
            print(f"[skip] {label}: {path} not found")
            continue
        parsed = parse_phrase_dict(path, label)
        added = 0
        for zh, vi in parsed.items():
            if zh in seen_pronoun_keys:
                continue
            seen_pronoun_keys.add(zh)
            pronoun_entries.append((zh, vi, label))
            added += 1
        print(f"  -> {added} new keys contributed by {label}")

    # ---- 4. Han-Viet fallback: pinyin-disambiguated primary + gap-fillers -
    hanviet_csv_path = SEED_DIR / "hanviet-pinyin.csv"
    hanviet_primary = parse_hanviet_pinyin_csv(hanviet_csv_path) if hanviet_csv_path.exists() else {}
    hanviet_rows = [(char, readings, "hanviet_pinyin_wordlist") for char, readings in hanviet_primary.items()]
    seen_hanviet_keys = set(hanviet_primary.keys())

    gap_filler_sources = [
        (REF_DIR / "script-vietphrase-translator" / "ChinesePhienAmWords.txt", "script-vietphrase-translator/PhienAm"),
        (REF_DIR / "file-vietphrase" / "ChinesePhienAmWords.txt", "file-vietphrase/PhienAm"),
        (REF_DIR / "TienDich" / "data" / "ChinesePhienAmWords.txt", "TienDich/PhienAm"),
        (REF_DIR / "TienDich" / "data" / "ThieuChuu.txt", "ThieuChuu"),
    ]
    for path, label in gap_filler_sources:
        if not path.exists():
            print(f"[skip] {label}: {path} not found")
            continue
        parser = parse_thieuchuu if label == "ThieuChuu" else (lambda p, l=label: parse_simple_phienam(p, l))
        parsed = parser(path)
        added = 0
        for char, reading in parsed.items():
            if char in seen_hanviet_keys:
                continue
            seen_hanviet_keys.add(char)
            hanviet_rows.append((char, [reading], label))
            added += 1
        print(f"  -> {added} new hanviet gap-fill keys from {label}")

    # symbol table (Greek letters, roman numerals, math symbols, rare elements)
    symbols_path = REF_DIR / "file-vietphrase" / "PhienAmbaseR01.txt"
    if symbols_path.exists():
        parsed = parse_simple_phienam(symbols_path, "PhienAmbaseR01/symbols")
        added = 0
        for char, reading in parsed.items():
            if char in seen_hanviet_keys:
                continue
            seen_hanviet_keys.add(char)
            hanviet_rows.append((char, [reading], "PhienAmbaseR01/symbols"))
            added += 1
        print(f"  -> {added} new symbol keys from PhienAmbaseR01")

    # ---- 5. Scrape blacklist ------------------------------------------------
    blacklist_sources = [
        (REF_DIR / "TienDich" / "data" / "IgnoredChinesePhrases.txt", "TienDich/IgnoredChinesePhrases"),
        (REF_DIR / "Vietphrase" / "data" / "Blacklist.txt", "hoangtuantk/Blacklist"),
    ]
    blacklist_patterns = []
    seen_patterns = set()
    for path, label in blacklist_sources:
        if not path.exists():
            print(f"[skip] {label}: {path} not found")
            continue
        parsed = parse_blacklist(path, label)
        for p in parsed:
            if p in seen_patterns:
                continue
            seen_patterns.add(p)
            blacklist_patterns.append((p, label))

    build_db(word_entries, name_entries, pronoun_entries, hanviet_rows, blacklist_patterns, {})
    print("Done ->", OUT_DB)
