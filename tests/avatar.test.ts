import assert from "node:assert/strict";
import test from "node:test";
import { isAvatarImage } from "../lib/avatars";

test("recognizes public avatar images without treating mascot poses as URLs", () => {
  assert.equal(
    isAvatarImage("https://example.supabase.co/storage/v1/object/public/user-avatars/u1/a.webp"),
    true,
  );
  assert.equal(isAvatarImage("face"), false);
  assert.equal(isAvatarImage("http://example.com/storage/v1/object/public/user-avatars/u1/a.webp"), false);
});

test("profile edits cannot submit a pre-minted custom avatar URL", async () => {
  const route = await import("node:fs").then(({ readFileSync }) =>
    readFileSync(new URL("../lib/profile/profile-edit-core.ts", import.meta.url), "utf8"),
  );
  assert.match(route, /command\.avatar !== "face"/);
});
