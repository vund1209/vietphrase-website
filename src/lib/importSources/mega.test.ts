import { test } from "node:test";
import assert from "node:assert/strict";
import { megaMatches } from "./mega.ts";
import { resolveImportSourceProvider } from "./providers.ts";

test("accepts a real-shaped mega.nz file share URL", () => {
  assert.equal(megaMatches("https://mega.nz/file/RqIBhbRS#5xSMrfBvNTUJaXAPczB7UUfg7AwbTNg3fKBaHx8kSAw"), true);
});

test("accepts www.mega.nz too", () => {
  assert.equal(megaMatches("https://www.mega.nz/file/RqIBhbRS#5xSMrfBvNTUJaXAPczB7UUfg7AwbTNg3fKBaHx8kSAw"), true);
});

test("rejects a mega.nz URL with no key fragment", () => {
  assert.equal(megaMatches("https://mega.nz/file/RqIBhbRS"), false);
});

test("rejects a mega.nz folder link (out of scope for now)", () => {
  assert.equal(megaMatches("https://mega.nz/folder/RqIBhbRS#5xSMrfBvNTUJaXAPczB7UUfg7AwbTNg3fKBaHx8kSAw"), false);
});

test("rejects a non-mega.nz hostname", () => {
  assert.equal(megaMatches("https://not-mega.nz.evil.com/file/RqIBhbRS#key"), false);
  assert.equal(megaMatches("https://example.com/file/RqIBhbRS#key"), false);
});

test("rejects an unparseable string", () => {
  assert.equal(megaMatches("not a url"), false);
});

test("resolveImportSourceProvider resolves a mega.nz URL to the mega provider", () => {
  const provider = resolveImportSourceProvider(
    "https://mega.nz/file/RqIBhbRS#5xSMrfBvNTUJaXAPczB7UUfg7AwbTNg3fKBaHx8kSAw"
  );
  assert.equal(provider?.name, "mega.nz");
});

test("resolveImportSourceProvider returns null for an unsupported URL", () => {
  assert.equal(resolveImportSourceProvider("https://example.com/some/file.txt"), null);
});
