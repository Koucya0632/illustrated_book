// Regenerate lib/image-urls.json from the DB. That file is the canonical
// image per word — lib/words.ts reads it, and migrate.ts's syncSeedWordImages
// pushes its values back to the DB on every prod deploy. So whenever anything
// changes images on the DB side (admin upload under a new filename,
// upload-images.ts), run this and commit the diff, or the next deploy will
// revert the DB to the stale committed values.
//
//   npx tsx scripts/sync-image-urls.ts   (or: npm run sync-image-urls)
//
// Requires: DATABASE_URL. Run from the repo root.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { words as seedWords } from "../lib/words";

const STORAGE_MARKER = "/storage/v1/object/public/word-images/";
const OUT_PATH = join(process.cwd(), "lib", "image-urls.json");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[sync-image-urls] missing env DATABASE_URL");
  process.exit(1);
}

async function main() {
  const sql = postgres(url!, { ssl: "require", prepare: false, max: 1 });
  try {
    const rows = (await sql`
      SELECT id, image_url FROM words
      WHERE image_url IS NOT NULL AND image_url <> ''
      ORDER BY id
    `) as unknown as { id: string; image_url: string }[];

    const seedIds = new Set(seedWords.map((w) => w.id));
    const map: Record<string, string> = {};
    for (const r of rows) {
      if (!seedIds.has(r.id)) continue; // admin-only words aren't seed-managed
      map[r.id] = r.image_url;
      if (!r.image_url.includes(STORAGE_MARKER)) {
        console.warn(`[sync-image-urls] WARNING non-Storage URL: ${r.id} -> ${r.image_url}`);
      }
    }

    const missing = seedWords.filter((w) => !map[w.id]);
    for (const w of missing) {
      console.warn(`[sync-image-urls] WARNING seed word has no DB image: ${w.id}`);
    }

    writeFileSync(OUT_PATH, JSON.stringify(map, null, 2) + "\n");
    console.log(
      `[sync-image-urls] wrote ${Object.keys(map).length} entries to lib/image-urls.json` +
        ` (${rows.length} DB rows, ${seedIds.size} seed words)`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("[sync-image-urls] failed:", e);
  process.exit(1);
});
