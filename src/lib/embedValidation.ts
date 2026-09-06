// Guards POST /api/novels against creating a garbage Novel row when the
// generic extractor mis-detects *something* resembling a chapter list on
// a page that isn't actually one -- see the planning doc's section 7.
// Before this, the only rejection was "zero chapters found" (already
// enforced inside src/lib/scraper.ts's fetchChapterList); this closes the
// remaining gap for a non-empty but clearly-wrong result.
import type { FetchedChapterList } from "./scraper";

const HAN_CHAR_RE = /\p{Script=Han}/u;

/** Returns a user-facing rejection message, or null if the fetch looks like a real Chinese novel page. */
export function validateFetchedBook(fetched: FetchedChapterList): string | null {
  if (!fetched.bookTitle?.trim()) {
    return "Không xác định được tiêu đề truyện trên trang này -- có thể đây không phải trang mục lục truyện.";
  }

  // Same Han-character-ratio idea used elsewhere (see
  // src/lib/candidateNames.ts) as a cheap "does this even look like a
  // Chinese novel page" signal -- a misparsed nav/menu page's "chapter"
  // titles (e.g. site nav items) and title/description also tend to have
  // no CJK content at all.
  const sample = [fetched.bookTitle, fetched.description, ...fetched.chapters.slice(0, 3).map((c) => c.title)]
    .filter(Boolean)
    .join(" ");
  if (!HAN_CHAR_RE.test(sample)) {
    return "Nội dung trang này không có vẻ là tiếng Trung -- chỉ hỗ trợ nhúng truyện tiếng Trung.";
  }

  return null;
}
