// One-shot backfill: download every word's external image, re-encode it as
// WebP, upload to our own Supabase Storage bucket, then rewrite
// words.image_url to the Storage public URL. Records the original URL in
// image_source_url and a coarse license tag in image_license for audit
// purposes.
//
// The re-encode is not optional and not a size tweak: uploading originals is
// what put 741 MB of PNG in this bucket and got the project egress-restricted.
//
// Idempotent: if image_url already points at our Storage host, it skips.
// Re-running picks up failed rows.
//
//   npx tsx scripts/upload-images.ts
//
// Requires: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import {
  WORD_IMAGE_BUCKET_RULES,
  WORD_IMAGE_CONTENT_TYPE,
  encodeWordImage,
} from "../lib/word-image-encode";

const BUCKET = "word-images";
import { listPublicObjects, putPublicObject } from "../lib/storage/public-writer";
import { isPublicObjectUrl, publicObjectUrl } from "../lib/storage/public-objects";

interface WordRow {
  id: string;
  image_url: string;
  image_source_url: string | null;
}

function envOrDie(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[upload-images] missing env ${name}`);
    process.exit(1);
  }
  return v;
}

function licenseTagForUrl(url: string): string {
  const host = new URL(url).hostname;
  if (host.endsWith("wikimedia.org") || host.endsWith("wikipedia.org")) {
    // Most files there are CC-BY-SA / CC-BY / PD. We don't fetch the precise
    // per-file metadata here — admin can refine via the UI later.
    return "wikimedia-commons";
  }
  if (host.endsWith("loremflickr.com")) {
    // Random Flickr photos by keyword; license is unknowable from URL.
    return "unknown";
  }
  return "external";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

async function ensureBucket(supabase: SB) {
  // listBuckets requires service role.
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (buckets?.some((b: { name: string }) => b.name === BUCKET)) {
    // `createBucket` options apply only at creation, and this bucket was
    // created long ago — so a rule stated only there would never reach the
    // live bucket. Push it every run instead.
    const { error: updateErr } = await supabase.storage.updateBucket(BUCKET, WORD_IMAGE_BUCKET_RULES);
    if (updateErr) throw updateErr;
    console.log(`[upload-images] bucket "${BUCKET}" exists — rules re-applied (webp only, 2MB)`);
    return;
  }
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, WORD_IMAGE_BUCKET_RULES);
  if (createErr) throw createErr;
  console.log(`[upload-images] created public bucket "${BUCKET}"`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Fail fast on 429: one retry only, with a short wait. The script is
// designed to be re-run repeatedly, so missing rows on a given pass are
// fine — the next run resumes where the previous left off (via the
// bucket-listing skip path). This avoids long stalls behind Wikimedia's
// minutes-long backoff windows.
async function fetchWithRetry(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { "User-Agent": "everyday-english-picture-dictionary/1.0 (backfill)" },
    redirect: "follow",
  });
  if (res.status !== 429) return res;
  console.log("    429 — waiting 20s and retrying once");
  await sleep(20_000);
  return await fetch(url, {
    headers: { "User-Agent": "everyday-english-picture-dictionary/1.0 (backfill)" },
    redirect: "follow",
  });
}

async function uploadOne(
  existing: Map<string, string>,  // word_id → ext we already have on Storage
  row: WordRow,
): Promise<{ skipped?: true; ok?: true; ext?: string; failed?: string }> {
  // Already one of ours — in either spelling, so a migrated URL is not
  // re-downloaded and re-uploaded on the next run.
  if (isPublicObjectUrl(row.image_url, BUCKET)) {
    return { skipped: true };
  }
  // Skip download if the storage object already exists from a prior partial
  // run — just update the DB row to reflect it.
  const existingExt = existing.get(row.id);
  if (existingExt) {
    return { ok: true, ext: existingExt };
  }

  try {
    const res = await fetchWithRetry(row.image_url);
    if (!res.ok) {
      return { failed: `HTTP ${res.status} fetching ${row.image_url}` };
    }
    const ext = "webp";
    const path = `${row.id}.${ext}`;
    const buf = await encodeWordImage(Buffer.from(await res.arrayBuffer()));
    try {
      await putPublicObject(BUCKET, path, buf, {
        contentType: WORD_IMAGE_CONTENT_TYPE,
        upsert: true,
      });
    } catch (e) {
      return { failed: `upload: ${e instanceof Error ? e.message : String(e)}` };
    }
    existing.set(row.id, ext);
    return { ok: true, ext };
  } catch (e) {
    return { failed: e instanceof Error ? e.message : String(e) };
  }
}

async function listExistingObjects(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const name of await listPublicObjects(BUCKET, "")) {
    const m = name.match(/^(.+)\.([a-z]+)$/i);
    if (!m) continue;
    const id = m[1];
    const ext = m[2].toLowerCase();
    // Until the retired PNGs are deleted, a word has an object under both
    // extensions. WebP is the live one — without this the first-listed `.png`
    // could win and a new word would be recorded as already uploaded.
    if (out.get(id) === "webp") continue;
    out.set(id, ext);
  }
  return out;
}

async function main() {
  const dbUrl = envOrDie("DATABASE_URL");
  const supabaseUrl = envOrDie("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envOrDie("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const sql = postgres(dbUrl, { ssl: "require", prepare: false, max: 1 });

  try {
    await ensureBucket(supabase);
    const existing = await listExistingObjects();
    console.log(`[upload-images] ${existing.size} objects already in bucket`);

    const rows = await sql<WordRow[]>`
      SELECT id, image_url, image_source_url
      FROM words
      WHERE image_url IS NOT NULL
      ORDER BY id
    `;
    console.log(`[upload-images] processing ${rows.length} words`);

    let ok = 0;
    let skipped = 0;
    const failures: Array<{ id: string; reason: string }> = [];

    for (const row of rows) {
      const r = await uploadOne(existing, row);
      if (r.skipped) {
        skipped++;
        continue;
      }
      if (r.failed) {
        failures.push({ id: row.id, reason: r.failed });
        console.log(`  ✗ ${row.id}: ${r.failed}`);
        continue;
      }
      const ext = r.ext ?? "jpg";
      const newUrl = publicObjectUrl(BUCKET, `${row.id}.${ext}`);
      const license = licenseTagForUrl(row.image_url);
      await sql`
        UPDATE words SET
          image_url = ${newUrl},
          image_source_url = COALESCE(image_source_url, ${row.image_url}),
          image_license = COALESCE(image_license, ${license})
        WHERE id = ${row.id}
      `;
      ok++;
      console.log(`  ✓ ${row.id} → ${newUrl}`);
      // Aggressive politeness — 25s gap empirically keeps us under the
      // 429 cliff for individual files. Skipped rows (already in bucket)
      // contribute no delay so re-runs are cheap.
      if (!existing.has(row.id)) await sleep(25_000);
    }

    console.log(
      `[upload-images] done: ${ok} uploaded, ${skipped} already-on-storage, ${failures.length} failed`,
    );
    if (failures.length) {
      console.log("[upload-images] failures:");
      for (const f of failures) console.log(`  - ${f.id}: ${f.reason}`);
      process.exit(1);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("[upload-images] failed:", e);
  process.exit(1);
});
