import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafePublicUrl } from "./urlSafety.ts";

test("accepts an ordinary public https URL", () => {
  assert.equal(isSafePublicUrl("https://book.sfacg.com/Novel/530508/"), true);
});

test("rejects a non-http(s) protocol", () => {
  assert.equal(isSafePublicUrl("file:///etc/passwd"), false);
});

test("rejects localhost", () => {
  assert.equal(isSafePublicUrl("http://localhost:3000/"), false);
});

test("rejects loopback IPv4", () => {
  assert.equal(isSafePublicUrl("http://127.0.0.1/"), false);
});

test("rejects link-local IPv4 (cloud metadata range)", () => {
  assert.equal(isSafePublicUrl("http://169.254.169.254/latest/meta-data/"), false);
});

test("rejects private IPv4 ranges", () => {
  assert.equal(isSafePublicUrl("http://10.0.0.5/"), false);
  assert.equal(isSafePublicUrl("http://172.16.0.5/"), false);
  assert.equal(isSafePublicUrl("http://192.168.1.1/"), false);
});

test("rejects IPv6 loopback and link-local", () => {
  assert.equal(isSafePublicUrl("http://[::1]/"), false);
  assert.equal(isSafePublicUrl("http://[fe80::1]/"), false);
});

test("rejects an unparseable URL", () => {
  assert.equal(isSafePublicUrl("not a url"), false);
});
