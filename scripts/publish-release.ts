// Shared publisher for a registered release that opens a new topic
// (lib/catalogue/releases.ts, `sharedPublisher: true`). See docs/releases/README.md.
//
// Default mode is a SELECT-only dry run:
//   npm run release:publish -- --release <id>
//
// Production writes require --apply plus the database and physical Storage
// fingerprints the dry run printed:
//   npm run release:publish -- --release <id> --apply \
//     --confirm-host <database-fingerprint> --confirm-storage <storage-fingerprint>
//
// Continue an interrupted apply, or roll one back (compare-and-swap guarded):
//   ... --apply --resume <apply-manifest.json> --confirm-host … --confirm-storage …
//   ... --rollback <apply-manifest.json> --confirm-host … --confirm-storage …

import path from "node:path";
import postgres from "postgres";
import { publishDescriptor } from "../lib/catalogue/publish/descriptor";
import {
  databaseHostFingerprint,
  publishRelease,
  type PublishRequest,
} from "../lib/catalogue/publish/publish";
import { currentStorageTargetFingerprint, liveStoragePort } from "../lib/catalogue/publish/storage";
import { assertWriterConfigured, writeBackend } from "../lib/storage/public-writer";

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
  const apply = process.argv.includes("--apply");
  const rollbackFile = argument("--rollback");
  const resumeFile = argument("--resume");
  if (rollbackFile && (apply || resumeFile)) throw new Error("do not combine --rollback with --apply or --resume");
  if (resumeFile && !apply) throw new Error("--resume requires --apply");

  const root = process.cwd();
  const descriptor = publishDescriptor(release);
  const planFile = path.resolve(root, argument("--plan") ?? path.join(descriptor.prepDirectory, "publish-plan.json"));
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("missing DATABASE_URL");
  // Apply and dry run need a usable writer. Rollback is database-only and must
  // stay recoverable while Storage credentials are down.
  if (!rollbackFile) assertWriterConfigured();
  const confirmHost = argument("--confirm-host");
  const confirmStorage = argument("--confirm-storage");
  const request: PublishRequest = rollbackFile
    ? { mode: "rollback", manifest: rollbackFile, confirmHost, confirmStorage }
    : apply
      ? { mode: "apply", confirmHost, confirmStorage, resume: resumeFile }
      : { mode: "dry-run" };

  const sql = postgres(databaseUrl, { ssl: "require", prepare: false, max: 1 });
  try {
    await publishRelease(planFile, request, {
      sql,
      storage: liveStoragePort(),
      root,
      target: {
        hostFingerprint: databaseHostFingerprint(databaseUrl),
        storageBackend: writeBackend(),
        storageFingerprint: currentStorageTargetFingerprint(),
      },
    });
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[release:publish] failed:", error);
  process.exitCode = 1;
});
