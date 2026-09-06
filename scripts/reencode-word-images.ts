// Re-encode every word image as WebP and upload it alongside the PNG.
//
// Why: the `word-images` bucket held 496 PNGs averaging 1.5 MB (741 MB total),
// served at full resolution to a 48x48 marquee on the marketing page and to
// iOS grid tiles with no Nuke processor. That egress is what got the Supabase
// project restricted (`exceed_cached_egress_quota`) on 2026-08-19. These are
// flat-colour illustrations — the format was simply wrong. Measured on a
// sample: 41x smaller, no visible loss.
//
// This is the same treatment `lib/avatar-storage.ts` and `lib/atlas/storage.ts`
// already give every other bucket. `word-images` is the one that never got it.
//
// Pipeline per image:
//   1. Download `word-images/<key>.png` (or read it from --local)
//   2. Back the original bytes up to /tmp/word-images-png-backup/
//   3. sharp.resize(1200, withoutEnlargement).webp(quality 82)
//   4. Write to /tmp/word-images-webp-out/ for eyeballing
//   5. If --apply: upload `word-images/<key>.webp` (upsert)
//
// It deliberately does NOT touch `words.image_url`. Upload and the DB flip are
// separate so a partial run can be re-run instead of leaving half the catalogue
// pointing at objects that may not exist. Flip the DB only once this reports
// zero failures. And after flipping, regenerate AND COMMIT lib/image-urls.json
// — `syncSeedWordImages()` in scripts/migrate.ts pushes that file back to the
// DB on every prod deploy and will silently revert the flip otherwise.
//
//   # no credentials needed — validates the encode against a local copy
//   npx tsx scripts/reencode-word-images.ts --local=public/word-images
//
//   npx tsx --env-file=.env.local scripts/reencode-word-images.ts           # dry-run
//   npx tsx --env-file=.env.local scripts/reencode-word-images.ts --apply
//
// Flags: --local=<dir>  --apply  --only=id1,id2  --limit=N  --force
//
// Requires (except in --local mode): NEXT_PUBLIC_SUPABASE_URL,
//   SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL.

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import fs from "node:fs/promises";
import path from "node:path";
import {
  WORD_IMAGE_CONTENT_TYPE,
  encodeWordImage,
  webpObjectKey,
} from "../lib/word-image-encode";

const BUCKET = "word-images";
import { listPublicObjects, putPublicObject } from "../lib/storage/public-writer";
const BACKUP_DIR = "/tmp/word-images-png-backup";
const OUT_DIR = "/tmp/word-images-webp-out";

// Same marker sync-image-urls.ts uses to decide what is "ours".
// Host-agnostic: matches the bucket segment, so rows already moved to the
// asset host are still selected instead of the query silently returning none.
const STORAGE_MARKER = "/word-images/";

function envOrDie(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[reencode] missing env ${name}`);
    process.exit(1);
  }
  return v;
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)}KB`;
}

interface Job {
  id: string;
  /** Object key inside the bucket, e.g. `access-card.png`. */
  key: string;
  /** Where to read the original from. */
  read: () => Promise<Buffer>;
}

/** Local-only mode: encode whatever PNGs are in a directory. No DB, no network. */
async function localJobs(dir: string): Promise<Job[]> {
  const names = (await fs.readdir(dir)).filter((n) => /\.(png|jpe?g)$/i.test(n)).sort();
  return names.map((name) => ({
    id: name.replace(/\.[a-z0-9]+$/i, ""),
    key: name,
    read: () => fs.readFile(path.join(dir, name)),
  }));
}

async function dbJobs(): Promise<Job[]> {
  const sql = postgres(envOrDie("DATABASE_URL"), { ssl: "require" });
  const rows = (await sql`
    SELECT id, image_url FROM words
    WHERE deleted_at IS NULL AND status = 'published'
      AND image_url LIKE ${"%" + STORAGE_MARKER + "%"}
    ORDER BY id
  `) as unknown as { id: string; image_url: string }[];
  await sql.end();

  return rows.flatMap((row) => {
    const m = row.image_url.match(/\/word-images\/(.+)$/);
    if (!m) return [];
    const key = m[1];
    return [
      {
        id: row.id,
        key,
        read: async () => {
          const res = await fetch(row.image_url);
          if (!res.ok) throw new Error(`download HTTP ${res.status}`);
          return Buffer.from(await res.arrayBuffer());
        },
      },
    ];
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const force = argv.includes("--force");
  const localArg = argv.find((a) => a.startsWith("--local="));
  const onlyArg = argv.find((a) => a.startsWith("--only="));
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const onlyIds = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : null;

  if (localArg && apply) {
    console.error("[reencode] --local is a validation mode; it cannot --apply.");
    process.exit(1);
  }

  await ensureDir(BACKUP_DIR);
  await ensureDir(OUT_DIR);

  let jobs = localArg ? await localJobs(localArg.slice("--local=".length)) : await dbJobs();
  if (onlyIds) jobs = jobs.filter((j) => onlyIds.has(j.id));
  if (limit) jobs = jobs.slice(0, limit);

  const supabase = localArg
    ? null
    : createClient(envOrDie("NEXT_PUBLIC_SUPABASE_URL"), envOrDie("SUPABASE_SERVICE_ROLE_KEY"));

  // Resume: anything already uploaded is skipped unless --force. One list call
  // rather than a HEAD per image.
  const existing = new Set<string>();
  if (supabase && !force) {
      for (const name of await listPublicObjects(BUCKET, "")) {
        if (name.endsWith(".webp")) existing.add(name);
      }
  }

  const mode = localArg ? `LOCAL(${localArg.slice("--local=".length)})` : apply ? "APPLY" : "dry-run";
  console.log(`[reencode] ${mode} — ${jobs.length} images, ${existing.size} already webp`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  let inBytes = 0;
  let outBytes = 0;
  const worst: { id: string; ratio: number; from: number; to: number }[] = [];

  for (const job of jobs) {
    const target = webpObjectKey(job.key);
    if (existing.has(target)) {
      skipped++;
      continue;
    }
    try {
      const src = await job.read();
      const out = await encodeWordImage(src);
      inBytes += src.length;
      outBytes += out.length;
      worst.push({ id: job.id, ratio: src.length / out.length, from: src.length, to: out.length });

      if (!localArg) await fs.writeFile(path.join(BACKUP_DIR, job.key), src);
      await fs.writeFile(path.join(OUT_DIR, target), out);

      if (apply && supabase) {
        await putPublicObject(BUCKET, target, out, {
          upsert: true,
          contentType: WORD_IMAGE_CONTENT_TYPE,
        });
      }
      ok++;
      if (ok % 50 === 0) console.log(`  ${ok}/${jobs.length}…`);
    } catch (err) {
      failed++;
      console.warn(`  [${job.id}] FAILED:`, err instanceof Error ? err.message : err);
    }
  }

  // The least-compressed images are the ones worth eyeballing in OUT_DIR —
  // a poor ratio means detail the encoder had to work at, which is exactly
  // where quality 82 would show if it were going to.
  worst.sort((a, b) => a.ratio - b.ratio);
  console.log(`\n[reencode] least compressed (check these in ${OUT_DIR}):`);
  for (const w of worst.slice(0, 8)) {
    console.log(`  ${w.id.padEnd(28)} ${kb(w.from).padStart(8)} -> ${kb(w.to).padStart(7)}  ${w.ratio.toFixed(1)}x`);
  }

  const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + "MB";
  console.log(
    `\n[reencode] ok=${ok} skipped=${skipped} failed=${failed}` +
      (ok > 0 ? `\n[reencode] ${mb(inBytes)} -> ${mb(outBytes)}  (${(inBytes / outBytes).toFixed(0)}x smaller)` : ""),
  );
  if (failed > 0) {
    console.error(`\n[reencode] ${failed} failed — do NOT flip words.image_url until this is clean.`);
    process.exit(1);
  }
  if (apply) {
    console.log(
      "\n[reencode] next: flip words.image_url .png -> .webp, then\n" +
        "           npx tsx scripts/sync-image-urls.ts && git add lib/image-urls.json\n" +
        "           (skip the commit and migrate.ts will revert the flip on deploy)",
    );
  }
}

main().catch((err) => {
  console.error("[reencode] fatal:", err);
  process.exit(1);
});
