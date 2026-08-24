// Replace published main-word images with versioned, content-addressed WebPs.
//
// Dry run (default):
//   npx tsx scripts/replace-main-word-images.ts --expected-count 32
//
// Apply Storage uploads + guarded DB updates:
//   npx tsx scripts/replace-main-word-images.ts --expected-count 32 --apply
//
// Roll back DB image metadata using an apply manifest:
//   npx tsx scripts/replace-main-word-images.ts --rollback <manifest.json>
//
// The source directory defaults to output/imagegen/atlas-replacements and
// expects files named <word-id>-v2.webp. Candidates are normalized once more
// before upload, and Storage object names contain a SHA-256 prefix of the exact
// uploaded WebP bytes so CDN and device caches always see a new URL.

import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { prepareMainWordImageCandidate } from "../lib/main-word-image-replacement";
import { WORD_IMAGE_CONTENT_TYPE } from "../lib/word-image-encode";

loadEnvConfig(process.cwd());

const BUCKET = "word-images";
const APPLY = process.argv.includes("--apply");

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function envOrDie(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

function isoForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

interface WordImageRow {
  id: string;
  image_url: string;
  image_source_url: string | null;
  image_license: string | null;
  image_credit: string | null;
}

interface ManifestItem {
  id: string;
  localFile: string;
  sha256: string;
  storagePath: string;
  oldUrl: string;
  newUrl: string;
  oldSourceUrl: string | null;
  oldLicense: string | null;
  oldCredit: string | null;
}

interface ReplacementManifest {
  version: 1;
  status: "prepared" | "applied" | "rolled-back";
  createdAt: string;
  appliedAt?: string;
  rolledBackAt?: string;
  sourceDir: string;
  bucket: string;
  items: ManifestItem[];
}

function writeManifest(file: string, manifest: ReplacementManifest) {
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function rollback(manifestPath: string) {
  if (APPLY) throw new Error("do not combine --rollback with --apply");
  const resolved = path.resolve(process.cwd(), manifestPath);
  const manifest = JSON.parse(fs.readFileSync(resolved, "utf8")) as ReplacementManifest;
  if (manifest.version !== 1 || !Array.isArray(manifest.items) || manifest.items.length === 0) {
    throw new Error("invalid or empty replacement manifest");
  }

  const sql = postgres(envOrDie("DATABASE_URL"), {
    ssl: "require",
    prepare: false,
    max: 1,
  });
  try {
    await sql.begin(async (tx) => {
      for (const item of manifest.items) {
        const changed = await tx<{ id: string }[]>`
          UPDATE words SET
            image_url = ${item.oldUrl},
            image_source_url = ${item.oldSourceUrl},
            image_license = ${item.oldLicense},
            image_credit = ${item.oldCredit},
            updated_at = now()
          WHERE id = ${item.id}
            AND status = 'published'
            AND deleted_at IS NULL
            AND image_url = ${item.newUrl}
          RETURNING id
        `;
        if (changed.length !== 1) {
          throw new Error(`${item.id}: live URL no longer matches the manifest; rollback aborted`);
        }
      }
    });
    manifest.status = "rolled-back";
    manifest.rolledBackAt = new Date().toISOString();
    writeManifest(resolved, manifest);
    console.log(`[replace-main-word-images] rolled back ${manifest.items.length} rows`);
  } finally {
    await sql.end();
  }
}

async function main() {
  const rollbackPath = argValue("--rollback");
  if (rollbackPath) {
    await rollback(rollbackPath);
    return;
  }

  const sourceDir = path.resolve(
    process.cwd(),
    argValue("--source-dir") ?? "output/imagegen/atlas-replacements",
  );
  const expectedRaw = argValue("--expected-count");
  const expectedCount = expectedRaw ? Number(expectedRaw) : null;
  if (expectedCount !== null && (!Number.isInteger(expectedCount) || expectedCount <= 0)) {
    throw new Error("--expected-count must be a positive integer");
  }
  if (!fs.existsSync(sourceDir)) throw new Error(`missing source directory: ${sourceDir}`);

  const filenames = fs
    .readdirSync(sourceDir)
    .filter((name) => name.endsWith("-v2.webp"))
    .sort();
  if (filenames.length === 0) throw new Error("no *-v2.webp candidates found");
  if (expectedCount !== null && filenames.length !== expectedCount) {
    throw new Error(`expected ${expectedCount} candidates, found ${filenames.length}`);
  }

  const prepared = await Promise.all(
    filenames.map(async (filename) =>
      prepareMainWordImageCandidate(
        filename,
        fs.readFileSync(path.join(sourceDir, filename)),
      ),
    ),
  );
  const ids = prepared.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate word IDs in source directory");
  for (const id of ids) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`invalid word ID derived from filename: ${id}`);
  }

  const databaseUrl = envOrDie("DATABASE_URL");
  const supabaseUrl = envOrDie("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envOrDie("SUPABASE_SERVICE_ROLE_KEY");
  const publicBase = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;
  const sql = postgres(databaseUrl, { ssl: "require", prepare: false, max: 1 });
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const rows = await sql<WordImageRow[]>`
      SELECT id, image_url, image_source_url, image_license, image_credit
      FROM words
      WHERE status = 'published' AND deleted_at IS NULL
    `;
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const missing = ids.filter((id) => !rowById.has(id));
    if (missing.length) throw new Error(`published main-word rows not found: ${missing.join(", ")}`);

    const preparedById = new Map(prepared.map((candidate) => [candidate.id, candidate]));
    const items: ManifestItem[] = filenames.map((filename, index) => {
      const candidate = prepared[index];
      const id = candidate.id;
      const fullPath = path.join(sourceDir, filename);
      const storagePath = `${id}-ai-${candidate.sha256.slice(0, 12)}.webp`;
      const old = rowById.get(id)!;
      return {
        id,
        localFile: fullPath,
        sha256: candidate.sha256,
        storagePath,
        oldUrl: old.image_url,
        newUrl: `${publicBase}${storagePath}`,
        oldSourceUrl: old.image_source_url,
        oldLicense: old.image_license,
        oldCredit: old.image_credit,
      };
    });

    console.log(`[replace-main-word-images] mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
    console.log(`[replace-main-word-images] candidates: ${items.length}`);
    for (const item of items) {
      console.log(`  ${item.id}: ${path.basename(item.oldUrl)} -> ${item.storagePath}`);
    }
    if (!APPLY) {
      console.log("[replace-main-word-images] no Storage or DB changes made");
      return;
    }

    const { data: existingData, error: listError } = await supabase.storage
      .from(BUCKET)
      .list("", { limit: 5000 });
    if (listError) throw new Error(`could not list Storage bucket: ${listError.message}`);
    const existing = new Set((existingData ?? []).map((object) => object.name));

    for (const item of items) {
      if (existing.has(item.storagePath)) {
        console.log(`  = ${item.storagePath} already uploaded`);
        continue;
      }
      const bytes = preparedById.get(item.id)?.bytes;
      if (!bytes) throw new Error(`${item.id}: prepared WebP bytes are missing`);
      const { error } = await supabase.storage.from(BUCKET).upload(item.storagePath, bytes, {
        contentType: WORD_IMAGE_CONTENT_TYPE,
        upsert: false,
        cacheControl: "31536000",
      });
      if (error) throw new Error(`${item.id}: upload failed: ${error.message}`);
      console.log(`  ↑ ${item.storagePath}`);
    }

    const manifestPath = path.join(sourceDir, `replacement-manifest-${isoForFilename()}.json`);
    const manifest: ReplacementManifest = {
      version: 1,
      status: "prepared",
      createdAt: new Date().toISOString(),
      sourceDir,
      bucket: BUCKET,
      items,
    };
    writeManifest(manifestPath, manifest);

    await sql.begin(async (tx) => {
      for (const item of items) {
        const changed = await tx<{ id: string }[]>`
          UPDATE words SET
            image_url = ${item.newUrl},
            image_source_url = COALESCE(image_source_url, ${item.oldUrl}),
            image_license = ${"ai-generated"},
            image_credit = ${"OpenAI ImageGen"},
            updated_at = now()
          WHERE id = ${item.id}
            AND status = 'published'
            AND deleted_at IS NULL
            AND image_url = ${item.oldUrl}
          RETURNING id
        `;
        if (changed.length !== 1) {
          throw new Error(`${item.id}: old URL changed concurrently; DB transaction aborted`);
        }
      }
    });

    manifest.status = "applied";
    manifest.appliedAt = new Date().toISOString();
    writeManifest(manifestPath, manifest);
    console.log(`[replace-main-word-images] updated ${items.length} published main-word rows`);
    console.log(`[replace-main-word-images] rollback manifest: ${manifestPath}`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[replace-main-word-images] failed:", error);
  process.exit(1);
});
