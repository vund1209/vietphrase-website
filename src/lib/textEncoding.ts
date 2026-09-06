// Decodes an uploaded .txt novel file to a JS string, detecting its
// encoding rather than assuming UTF-8 -- see the planning doc's section
// 8. Real-world Chinese novel .txt files circulating online are very
// often GBK (Simplified) or Big5 (Traditional), not UTF-8; confirmed by
// reviewing vietphrase.app (a directly relevant reference -- same tool
// name, same domain), which explicitly supports all three for its own
// .txt import.
//
// Not a true statistical detector (e.g. jschardet/chardet) -- this is a
// cheap, honestly-scoped heuristic: try strict (fatal) decodes in a fixed
// preference order and take the first one that doesn't hit an invalid
// byte sequence. Node's TextDecoder ships full ICU data by default (not
// the small-icu subset), so "gbk"/"big5" are valid, real decoders here,
// not a stub.
export type DetectedEncoding = "utf-8" | "gbk" | "big5";

export interface DecodedText {
  text: string;
  encoding: DetectedEncoding;
}

const UTF8_BOM = [0xef, 0xbb, 0xbf];

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && UTF8_BOM.every((b, i) => bytes[i] === b);
}

export function decodeTextFile(buffer: ArrayBuffer): DecodedText {
  const bytes = new Uint8Array(buffer);

  if (hasUtf8Bom(bytes)) {
    return { text: new TextDecoder("utf-8").decode(bytes.slice(3)), encoding: "utf-8" };
  }

  // Strict UTF-8 first -- succeeds for genuine UTF-8 (the common case for
  // more recently produced files) or plain ASCII; a GBK/Big5 file will
  // almost always contain a byte sequence invalid in UTF-8 and throw.
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    // fall through
  }

  // GBK before Big5: Simplified Chinese web novel sources are more common
  // in this app's stated audience than Traditional ones.
  for (const encoding of ["gbk", "big5"] as const) {
    try {
      return { text: new TextDecoder(encoding, { fatal: true }).decode(bytes), encoding };
    } catch {
      // try the next one
    }
  }

  // Last resort: lossy UTF-8 (invalid sequences become U+FFFD) rather
  // than failing the upload outright.
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(bytes), encoding: "utf-8" };
}
