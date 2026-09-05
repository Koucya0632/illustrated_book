import assert from "node:assert/strict";
import test from "node:test";
import {
  decideCopy,
  normalizeEtag,
  r2KeyFor,
  verifyIntegrity,
  type SourceObject,
} from "../scripts/asset-migration-core";
import { publicObjectUrl } from "../lib/storage/public-objects";

const source: SourceObject = {
  bucket: "word-audio",
  name: "curtains/en-US.mp3",
  size: 11_000,
  contentType: "audio/mpeg",
};

test("the R2 key is the URL path the asset host will be asked for", () => {
  assert.equal(r2KeyFor(source.bucket, source.name), "word-audio/curtains/en-US.mp3");
});

test("copies what is absent, and re-copies what differs in size", () => {
  assert.deepEqual(decideCopy(source, null), { action: "copy", reason: "missing" });
  assert.deepEqual(decideCopy(source, { size: 9, etag: null }), {
    action: "copy",
    reason: "size-differs",
  });
});

// Re-running the migration must be cheap and safe, not a second full transfer.
test("skips objects already present at the same size", () => {
  assert.deepEqual(decideCopy(source, { size: 11_000, etag: '"abc"' }), {
    action: "skip",
    reason: "already-present",
  });
});

test("etag normalisation strips quotes and case", () => {
  assert.equal(normalizeEtag('"AbC123"'), "abc123");
  assert.equal(normalizeEtag(undefined), null);
  assert.equal(normalizeEtag(""), null);
});

test("integrity check catches bytes that changed in flight", () => {
  assert.equal(verifyIntegrity("abc123", '"abc123"').ok, true);
  assert.equal(verifyIntegrity("abc123", '"deadbeef"').ok, false);
});

test("integrity check does not fail closed when no md5 is available", () => {
  assert.equal(verifyIntegrity("abc123", null).ok, true);
  assert.equal(verifyIntegrity("abc123", '"abc123-4"').ok, true); // multipart
});

// The minter and the migrator are separate modules that must agree forever:
// the asset host resolves `https://host/<path>` to the object key `<path>`, so
// a URL this app hands out has to name the key the copy job actually wrote.
// Nothing else in the system would notice these two drifting apart — the
// symptom would be silent 404s on images, months later.
test("minted URLs address exactly the keys the copy job writes", () => {
  const prev = { ...process.env };
  process.env.NEXT_PUBLIC_ASSET_BASE_URL = "https://img.example.com";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  try {
    const cases: Array<[Parameters<typeof publicObjectUrl>[0], string]> = [
      ["word-images", "access-card.webp"],
      ["word-audio", "access-card/en-GB.mp3"],
      ["user-avatars", "472d0950-aec7/2fe1a5f0-64cc.webp"],
      ["atlas-public-images", "atlas-3c0d274b/thumb.webp"],
    ];
    for (const [bucket, path] of cases) {
      const url = new URL(publicObjectUrl(bucket, path));
      const keyFromUrl = decodeURIComponent(url.pathname).replace(/^\//, "");
      assert.equal(keyFromUrl, r2KeyFor(bucket, path));
    }
  } finally {
    process.env = prev;
  }
});
