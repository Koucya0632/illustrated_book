// Backfill: upload every local PNG in public/word-images/ to the Supabase
// Storage "word-images" bucket, then rewrite words.image_url to the Storage
// public URL.
//
// Idempotent: if image_url already points at our Storage host AND the object
// exists in the bucket, the file is skipped. Re-running picks up failed rows.
//
//   npx tsx scripts/upload-local-images.ts          (dry run by default)
//   npx tsx scripts/upload-local-images.ts --apply  (actually upload + update)
//   npx tsx scripts/upload-local-images.ts --apply --force-upload
//   npx tsx scripts/upload-local-images.ts --apply --force-upload --only-file ids.txt
//
// Requires: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const BUCKET = "word-images";
const LOCAL_DIR = path.resolve(process.cwd(), "public/word-images");
const APPLY = process.argv.includes("--apply");
const FORCE_UPLOAD = process.argv.includes("--force-upload");
const onlyFileArg = process.argv[process.argv.indexOf("--only-file") + 1];
const ONLY_IDS =
  process.argv.includes("--only-file") && onlyFileArg
    ? new Set(
        fs
          .readFileSync(path.resolve(process.cwd(), onlyFileArg), "utf8")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;

function envOrDie(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[upload-local-images] missing env ${name}`);
    process.exit(1);
  }
  return v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

async function listExistingObjects(supabase: SB): Promise<Set<string>> {
  const out = new Set<string>();
  const { data, error } = await supabase.storage.from(BUCKET).list("", { limit: 5000 });
  if (error) {
    console.warn(`[upload-local-images] could not list bucket: ${error.message}`);
    return out;
  }
  for (const obj of data as Array<{ name: string }>) out.add(obj.name);
  return out;
}

async function main() {
  const dbUrl = envOrDie("DATABASE_URL");
  const supabaseUrl = envOrDie("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envOrDie("SUPABASE_SERVICE_ROLE_KEY");

  if (!fs.existsSync(LOCAL_DIR)) {
    console.error(`[upload-local-images] missing local dir: ${LOCAL_DIR}`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(LOCAL_DIR)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .filter((f) => !ONLY_IDS || ONLY_IDS.has(f.replace(/\.png$/i, "")));
  if (files.length === 0) {
    console.log("[upload-local-images] no .png files to upload");
    return;
  }
  console.log(`[upload-local-images] mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`[upload-local-images] found ${files.length} local PNGs`);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const sql = postgres(dbUrl, { ssl: "require", prepare: false, max: 1 });
  const publicBase = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;

  try {
    const existing = await listExistingObjects(supabase);
    console.log(`[upload-local-images] bucket currently holds ${existing.size} objects`);

    let uploaded = 0;
    let updated = 0;
    let skippedUpload = 0;
    let missingRow = 0;
    const failures: Array<{ id: string; reason: string }> = [];

    for (const filename of files) {
      const id = filename.replace(/\.png$/i, "");
      const storagePath = `${id}.png`;
      const newUrl = `${publicBase}${storagePath}`;

      // 1. Upload to Storage (skip if already present)
      if (existing.has(storagePath) && !FORCE_UPLOAD) {
        skippedUpload++;
      } else if (APPLY) {
        const buf = fs.readFileSync(path.join(LOCAL_DIR, filename));
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
          contentType: "image/png",
          upsert: true,
          cacheControl: "31536000",
        });
        if (upErr) {
          failures.push({ id, reason: `upload: ${upErr.message}` });
          console.log(`  ✗ ${id}: upload failed — ${upErr.message}`);
          continue;
        }
        uploaded++;
        existing.add(storagePath);
        console.log(`  ↑ ${id}.png uploaded`);
      } else {
        uploaded++; // counted as "would upload"
      }

      // 2. Update DB row
      const row = await sql<{ id: string; image_url: string | null }[]>`
        SELECT id, image_url FROM words WHERE id = ${id}
      `;
      if (row.length === 0) {
        missingRow++;
        console.log(`  ? ${id}: no DB row — skipping image_url update`);
        continue;
      }
      if (row[0].image_url === newUrl) {
        continue;
      }
      if (APPLY) {
        await sql`
          UPDATE words SET
            image_url = ${newUrl},
            image_source_url = COALESCE(image_source_url, ${row[0].image_url}),
            image_license = COALESCE(image_license, ${"local-upload"})
          WHERE id = ${id}
        `;
      }
      updated++;
      console.log(`  ${APPLY ? "✓" : "·"} ${id} → image_url ${APPLY ? "updated" : "WOULD update"}`);
    }

    console.log(
      `[upload-local-images] done: ${uploaded} ${APPLY ? "uploaded" : "would-upload"}, ` +
        `${skippedUpload} already-on-storage, ${updated} ${APPLY ? "DB rows updated" : "DB rows would update"}, ` +
        `${missingRow} missing rows, ${failures.length} failures`,
    );
    if (failures.length) {
      console.log("[upload-local-images] failures:");
      for (const f of failures) console.log(`  - ${f.id}: ${f.reason}`);
      process.exit(1);
    }
    if (!APPLY) {
      console.log("\n[upload-local-images] this was a DRY RUN. Re-run with --apply to commit.");
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("[upload-local-images] failed:", e);
  process.exit(1);
});
