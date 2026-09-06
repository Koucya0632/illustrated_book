import assert from "node:assert/strict";
import test from "node:test";
import { isAvatarImage } from "../lib/avatars";

test("recognizes public avatar images without treating mascot poses as URLs", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  assert.equal(
    isAvatarImage("https://example.supabase.co/storage/v1/object/public/user-avatars/u1/a.webp"),
    true,
  );
  assert.equal(isAvatarImage("face"), false);
  assert.equal(isAvatarImage("http://example.com/storage/v1/object/public/user-avatars/u1/a.webp"), false);
});

// Tightened when URL construction moved into lib/storage/public-objects.ts:
// the old check matched on path shape alone, so any https host that spelled
// the Supabase path was accepted as one of our avatars.
test("an avatar path served by a foreign host is not our avatar", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  assert.equal(
    isAvatarImage("https://evil.example.com/storage/v1/object/public/user-avatars/u1/a.webp"),
    false,
  );
});

test("profile edits cannot submit a pre-minted custom avatar URL", async () => {
  const route = await import("node:fs").then(({ readFileSync }) =>
    readFileSync(new URL("../lib/profile/profile-edit-core.ts", import.meta.url), "utf8"),
  );
  assert.match(route, /command\.avatar !== "face"/);
});
