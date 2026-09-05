// One-shot normalize all word-images so every subject ends up with a
// consistent ~15% white margin. The earlier upload pipeline let through
// images with wildly varying native padding — some products bleed to the
// edge (wardrobe doors, vinegar bottle), others ship comfortable
// breathing room (chili flakes, bed). After this script every image
// behaves identically in iOS WordDetail / ReviewFlow heroes.
//
// Pipeline per image:
//   1. Download from Supabase Storage word-images/{id}.webp
//   2. Backup raw bytes to tmp/word-images-backup/{id}.png
//   3. sharp.trim(threshold:10)  → strip near-white border
//   4. sharp.extend(pad: 25% of max dim) → add uniform white margin
//   5. Output to tmp/word-images-out/{id}.webp
//   6. If --apply: re-upload to Supabase with upsert and same cache-control
//
// Idempotent on re-run: trim strips whatever we added, then re-adds 15%.
//
//   npx tsx scripts/normalize-word-images.ts            # dry-run
//   npx tsx scripts/normalize-word-images.ts --apply    # upload
//
// Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//           DATABASE_URL (for listing word ids).

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import postgres from "postgres";
import fs from "node:fs/promises";
import path from "node:path";
import { WORD_IMAGE_CONTENT_TYPE, WORD_IMAGE_QUALITY } from "../lib/word-image-encode";

const BUCKET = "word-images";
import { putPublicObject } from "../lib/storage/public-writer";
const MARGIN_PERCENT = 0.25;
const TRIM_THRESHOLD = 10; // 0-255, lower = stricter "is white"
// The bucket is WebP-only since the 2026-08 egress incident; re-uploading PNG
// here would now be rejected outright. The object key comes from the DB, which
// already ends in `.webp`, so only the encode had to change.
const BACKUP_DIR = "/tmp/word-images-backup";
const OUT_DIR = "/tmp/word-images-out";

function envOrDie(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[normalize] missing env ${name}`);
    process.exit(1);
  }
  return v;
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

interface WordRow {
  id: string;
  image_url: string;
}

async function normalize(buf: Buffer): Promise<Buffer> {
  // Strip pre-existing white border so we always re-pad from true content
  // bounds. `trim` returns the original buffer when nothing to trim, so
  // safe to call regardless.
  let img = sharp(buf, { failOn: "none" });
  try {
    img = sharp(await img.trim({ threshold: TRIM_THRESHOLD }).toBuffer(), {
      failOn: "none",
    });
  } catch {
    // trim throws on already-fully-transparent; fall back to original.
    img = sharp(buf, { failOn: "none" });
  }
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) {
    throw new Error("missing dimensions after trim");
  }
  const pad = Math.round(Math.max(w, h) * MARGIN_PERCENT);
  return img
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .webp({ quality: WORD_IMAGE_QUALITY })
    .toBuffer();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const onlyIds = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;

  await ensureDir(BACKUP_DIR);
  await ensureDir(OUT_DIR);

  const supabase = createClient(
    envOrDie("NEXT_PUBLIC_SUPABASE_URL"),
    envOrDie("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const sql = postgres(envOrDie("DATABASE_URL"), { ssl: "require" });
  const rows = (await sql<
    WordRow[]
  >`SELECT id, image_url FROM words WHERE deleted_at IS NULL AND status='published' ORDER BY id`) as unknown as WordRow[];
  await sql.end();

  const subset = onlyIds ? rows.filter((r) => onlyIds.has(r.id)) : rows;
  console.log(
    `[normalize] ${apply ? "APPLY" : "dry-run"} — processing ${subset.length}/${rows.length} images`,
  );

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of subset) {
    const url = row.image_url;
    // Storage key inside the bucket = the part after `/word-images/`. The
    // holds for both the Supabase and the asset-host spelling.
    const m = url.match(/\/word-images\/(.+)$/);
    if (!m) {
      console.warn(`  [${row.id}] non-storage url, skip:`, url);
      skipped++;
      continue;
    }
    const key = m[1];
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`download HTTP ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(path.join(BACKUP_DIR, `${row.id}.png`), buf);

      const out = await normalize(buf);
      await fs.writeFile(path.join(OUT_DIR, `${row.id}.webp`), out);

      if (apply) {
        await putPublicObject(BUCKET, key, out, {
          upsert: true,
          contentType: WORD_IMAGE_CONTENT_TYPE,
        });
      }
      ok++;
      if (ok % 20 === 0) console.log(`  ${ok}/${subset.length}…`);
    } catch (err) {
      console.error(`  [${row.id}] FAILED:`, (err as Error).message);
      failed++;
    }
  }
  console.log(
    `[normalize] done: ok=${ok}, skipped=${skipped}, failed=${failed}`,
  );
  console.log(`  backups: ${BACKUP_DIR}`);
  console.log(`  outputs: ${OUT_DIR}`);
  if (!apply) {
    console.log("  (dry-run; re-run with --apply to upload to Supabase)");
  }
}

main().catch((err) => {
  console.error("[normalize] fatal:", err);
  process.exit(1);
});
