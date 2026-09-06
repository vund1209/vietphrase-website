import { test } from "node:test";
import assert from "node:assert/strict";
import { isOwnerOrAdmin } from "./isOwnerOrAdmin.ts";

const novel = { addedByUserId: 42 };

test("returns false for no session", () => {
  assert.equal(isOwnerOrAdmin(novel, null), false);
});

test("returns false for a session with no user", () => {
  assert.equal(isOwnerOrAdmin(novel, { user: undefined }), false);
});

test("returns true for the owner", () => {
  assert.equal(isOwnerOrAdmin(novel, { user: { id: "42", role: "READER" } }), true);
});

test("returns false for a different reader", () => {
  assert.equal(isOwnerOrAdmin(novel, { user: { id: "7", role: "READER" } }), false);
});

test("returns true for an admin who is not the owner", () => {
  assert.equal(isOwnerOrAdmin(novel, { user: { id: "7", role: "ADMIN" } }), true);
});

test("returns false when the novel has no owner at all (addedByUserId null), even for a matching-looking id", () => {
  const orphaned = { addedByUserId: null };
  assert.equal(isOwnerOrAdmin(orphaned, { user: { id: "42", role: "READER" } }), false);
});

test("an admin still passes even when the novel has no owner", () => {
  const orphaned = { addedByUserId: null };
  assert.equal(isOwnerOrAdmin(orphaned, { user: { id: "1", role: "ADMIN" } }), true);
});

test("EDITOR role is not enough on its own -- only ADMIN or the actual owner", () => {
  assert.equal(isOwnerOrAdmin(novel, { user: { id: "7", role: "EDITOR" } }), false);
});
