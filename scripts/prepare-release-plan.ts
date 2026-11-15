// Read-only: write a release's publish plan. Uploads nothing, writes no row.
//
//   npm run release:prepare-publish -- --release <id> [--check-db]
//
// --check-db records a SELECT-only preflight of DATABASE_URL; the publisher
// refuses a plan without one.

import postgres from "postgres";
import { publishDescriptor } from "../lib/catalogue/publish/descriptor";
import { prepareReleasePlan, writePublishPlan } from "../lib/catalogue/publish/prepare";
import { databaseHostFingerprint } from "../lib/catalogue/publish/publish";
import { storageTarget } from "../lib/catalogue/publish/storage";

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function main() {
  const release = argument("--release");
  if (!release) throw new Error("--release <id> is required");
  const root = process.cwd();
  const descriptor = publishDescriptor(release);
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const checkDb = process.argv.includes("--check-db");
  if (checkDb && !databaseUrl) throw new Error("--check-db requires DATABASE_URL");
  const sql = checkDb ? postgres(databaseUrl!, { ssl: "require", prepare: false, max: 1 }) : null;
  try {
    const plan = await prepareReleasePlan(descriptor, {
      root,
      storageTarget: storageTarget(),
      database: sql ? { sql, hostFingerprint: databaseHostFingerprint(databaseUrl!) } : null,
    });
    const { file } = writePublishPlan(descriptor, plan, root);
    const db = plan.databasePreflight;
    console.log(JSON.stringify({
      file: `${descriptor.prepDirectory}/publish-plan.json`,
      written: file,
      planDigest: plan.planDigest,
      status: plan.status,
      summary: plan.summary,
      databasePreflight: db && {
        readyForGuardedApply: db.readyForGuardedApply, publishedCount: db.publishedCount,
        candidateRows: db.candidateRows.length, headwordConflicts: db.headwordConflicts.length,
        categoryRows: db.categoryRows.length, spanCollisions: db.spanCollisions.length,
      },
      storageTarget: { backend: plan.storageTarget.backend, bucket: plan.storageTarget.bucket, fingerprint: plan.storageTarget.fingerprint },
    }, null, 2));
  } finally {
    await sql?.end();
  }
}

main().catch((error) => {
  console.error("[release:prepare-publish]", error);
  process.exitCode = 1;
});
