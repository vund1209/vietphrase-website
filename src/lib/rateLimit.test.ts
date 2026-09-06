import { test } from "node:test";
import assert from "node:assert/strict";
import { getClientIp } from "./rateLimit.ts";

// checkRateLimit itself needs a live Postgres connection (it upserts
// RateLimitBucket rows), so it isn't covered here -- this project's unit
// tests are deliberately DB-independent (see every other *.test.ts file).
// getClientIp is the pure, DB-free piece worth covering directly: header
// parsing is exactly the kind of "looks obviously right" logic that's
// easy to get subtly wrong (e.g. a multi-hop x-forwarded-for chain).

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request("https://example.com", { headers });
}

test("reads a single x-forwarded-for value", () => {
  const req = requestWithHeaders({ "x-forwarded-for": "203.0.113.5" });
  assert.equal(getClientIp(req), "203.0.113.5");
});

test("takes only the first hop of a multi-hop x-forwarded-for chain", () => {
  const req = requestWithHeaders({ "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178" });
  assert.equal(getClientIp(req), "203.0.113.5");
});

test("trims whitespace around the first hop", () => {
  const req = requestWithHeaders({ "x-forwarded-for": "  203.0.113.5  ,70.41.3.18" });
  assert.equal(getClientIp(req), "203.0.113.5");
});

test("falls back to x-real-ip when x-forwarded-for is absent", () => {
  const req = requestWithHeaders({ "x-real-ip": "198.51.100.7" });
  assert.equal(getClientIp(req), "198.51.100.7");
});

test("falls back to 'unknown' when neither header is present", () => {
  const req = requestWithHeaders({});
  assert.equal(getClientIp(req), "unknown");
});
