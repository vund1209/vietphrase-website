// Defense-in-depth for scraped text (chapter body, title, description)
// before it's stored -- see the planning doc's section 5. Not a fix for a
// live exploit: every render path that shows this text renders it as a
// plain text child (React escapes it automatically), never
// dangerouslySetInnerHTML. This exists in case the generic extractor
// (src/lib/extract/*) ever mis-parses a page and lets raw markup through
// into what's supposed to be plain prose, alongside the existing
// filterBlacklist() pass (src/lib/blacklist.ts).
const SCRIPT_LIKE_TAG_RE = /<\/?(?:script|style|iframe|object|embed)\b[^>]*>/gi;
const ANY_TAG_RE = /<[^>]+>/g;
const JAVASCRIPT_URI_RE = /javascript\s*:/gi;
// C0 control characters except \x09 (tab), \x0A (newline), and \x0D
// (carriage return), which legitimate scraped prose can contain
// (paragraph breaks). Written with \x escapes, not literal bytes, so
// the character class can't be silently mangled by file encoding/transport.
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function stripDangerousMarkup(text: string): string {
  return text
    .replace(SCRIPT_LIKE_TAG_RE, "")
    .replace(ANY_TAG_RE, "")
    .replace(JAVASCRIPT_URI_RE, "")
    .replace(CONTROL_CHAR_RE, "");
}
