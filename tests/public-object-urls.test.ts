import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicObjectUrl,
  parsePublicObjectUrl,
  publicObjectUrl,
} from "../lib/storage/public-objects";

const SUPABASE = "https://project.supabase.co";
const ASSETS = "https://img.example.com";

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const prev = { ...process.env };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  try {
    fn();
  } finally {
    process.env = prev;
  }
}

test("mints Supabase URLs while no asset host is configured", () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE, NEXT_PUBLIC_ASSET_BASE_URL: undefined }, () => {
    assert.equal(
      publicObjectUrl("word-images", "curtains.webp"),
      `${SUPABASE}/storage/v1/object/public/word-images/curtains.webp`,
    );
  });
});

test("prefers the asset host once one is configured", () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE, NEXT_PUBLIC_ASSET_BASE_URL: ASSETS }, () => {
    assert.equal(
      publicObjectUrl("word-images", "curtains.webp"),
      `${ASSETS}/word-images/curtains.webp`,
    );
  });
});

// The invariant the iOS cache depends on: after the cutover, URLs the app
// cached under the old spelling must still be recognised.
test("both spellings stay readable after the cutover", () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE, NEXT_PUBLIC_ASSET_BASE_URL: ASSETS }, () => {
    const legacy = `${SUPABASE}/storage/v1/object/public/user-avatars/u1/a.webp`;
    const fresh = `${ASSETS}/user-avatars/u1/a.webp`;
    assert.deepEqual(parsePublicObjectUrl(legacy), { bucket: "user-avatars", path: "u1/a.webp" });
    assert.deepEqual(parsePublicObjectUrl(fresh), { bucket: "user-avatars", path: "u1/a.webp" });
    assert.ok(isPublicObjectUrl(legacy, "user-avatars"));
    assert.ok(isPublicObjectUrl(fresh, "user-avatars"));
  });
});

test("nested audio paths survive the round trip", () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE, NEXT_PUBLIC_ASSET_BASE_URL: undefined }, () => {
    const url = publicObjectUrl("word-audio", "curtains/en-US.mp3");
    assert.equal(url, `${SUPABASE}/storage/v1/object/public/word-audio/curtains/en-US.mp3`);
    assert.deepEqual(parsePublicObjectUrl(url), {
      bucket: "word-audio",
      path: "curtains/en-US.mp3",
    });
  });
});

test("rejects anything that is not one of our public objects", () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE, NEXT_PUBLIC_ASSET_BASE_URL: ASSETS }, () => {
    for (const value of [
      "https://evil.example.com/user-avatars/u1/a.webp", // wrong host
      `${ASSETS}/private-bucket/u1/a.webp`, // not a public bucket
      `${SUPABASE}/storage/v1/object/public/user-atlas-images/u1/a.webp`, // private bucket
      `${ASSETS}/user-avatars`, // bucket with no object path
      `http://img.example.com/user-avatars/u1/a.webp`, // not https
      "face", // the built-in avatar sentinel
      null,
      undefined,
      42,
    ]) {
      assert.equal(parsePublicObjectUrl(value), null, `should reject: ${String(value)}`);
      assert.equal(isPublicObjectUrl(value), false);
    }
  });
});

test("bucket filter is enforced", () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE, NEXT_PUBLIC_ASSET_BASE_URL: undefined }, () => {
    const url = publicObjectUrl("word-images", "curtains.webp");
    assert.ok(isPublicObjectUrl(url, "word-images"));
    assert.equal(isPublicObjectUrl(url, "user-avatars"), false);
  });
});
