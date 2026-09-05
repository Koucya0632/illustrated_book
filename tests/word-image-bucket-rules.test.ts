// Pins the two halves of "word-images holds nothing but WebP".
//
// THE RED LINE: this bucket is the one that got the Supabase project
// restricted (`exceed_cached_egress_quota`, 2026-08-19) by serving 741 MB of
// full-resolution PNGs to 48x48 tiles. The fix was an encoder every writer
// calls plus a bucket that rejects anything else — and for a while only the
// first half was real. WORD_IMAGE_BUCKET_RULES declared "webp only, 2 MB",
// but the only code applying it was a manual seeding script, so the live
// bucket still accepted jpeg/png/gif up to 10 MB.
//
// So there are two things to keep true, and a source test is the only place
// that can see both at once:
//   1. every writer encodes before uploading  (below)
//   2. the declared rules actually get applied (syncStorageBucketRules)

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { WORD_IMAGE_BUCKET_RULES, WORD_IMAGE_CONTENT_TYPE } from "../lib/word-image-encode";

const ROOT = join(import.meta.dirname, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else if (rel.endsWith(".ts")) out.push(rel);
  }
  return out;
}

const sources = [...walk("app"), ...walk("lib"), ...walk("scripts")];

test("the declared rules are webp-only and small", () => {
  assert.deepEqual(WORD_IMAGE_BUCKET_RULES.allowedMimeTypes, [WORD_IMAGE_CONTENT_TYPE]);
  assert.equal(WORD_IMAGE_CONTENT_TYPE, "image/webp");
  // 2 MB: a 1200px WebP of these illustrations lands under 300 KB, so a ceiling
  // anywhere near the old 10 MB would let an un-encoded original back in.
  assert.ok(WORD_IMAGE_BUCKET_RULES.fileSizeLimit <= 2 * 1024 * 1024);
});

test("every upload into word-images declares the WebP content type", () => {
  const offenders: string[] = [];
  const examined: string[] = [];
  for (const rel of sources) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    if (!src.includes('"word-images"')) continue;
    // Writers go through lib/storage/public-writer.ts now; the older direct
    // `.upload(` still counts so a reintroduced one is not missed.
    if (!/\.upload\(|putPublicObject\(/.test(src)) continue;
    examined.push(rel);
    // A file that uploads must name the shared content-type constant; a literal
    // "image/png" or a missing contentType is what this test is here to catch.
    if (!src.includes("WORD_IMAGE_CONTENT_TYPE")) offenders.push(rel);
  }
  // Without this the test goes quietly vacuous the day the paths move: zero
  // files scanned also produces zero offenders.
  assert.ok(
    examined.length >= 5,
    `expected to find the word-images writers, scanned ${sources.length} files and matched ${examined.length}`,
  );
  assert.deepEqual(offenders, [], `these upload to word-images without the shared content type: ${offenders.join(", ")}`);
});

test("migrate applies the bucket rules, not just declares them", () => {
  const migrate = readFileSync(join(ROOT, "scripts/migrate.ts"), "utf8");
  assert.match(migrate, /WORD_IMAGE_BUCKET_RULES/, "migrate must import the declared rules");
  assert.match(migrate, /UPDATE storage\.buckets/, "migrate must push them at the bucket");
  assert.match(
    migrate,
    /await syncStorageBucketRules\(sql\)/,
    "declaring the function is not enough — the main sequence must call it",
  );
});
