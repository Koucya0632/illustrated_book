// The shared publisher for a release that opens a new topic.
//
//   dry run   SELECT-only preflight; prints the fingerprints an apply must echo
//   apply     journal → reserve example ids → stage Storage → verify every
//             remote byte → insert drafts and publish in ONE transaction
//   resume    continue an interrupted apply from its journal
//   rollback  compare-and-swap guarded delete; Storage objects are retained
//
// The CLI (scripts/publish-release.ts) supplies the database, Storage and the
// target fingerprints; tests supply a throwaway Postgres and in-memory Storage.

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import {
  assertRowSet,
  assertStoredContentMatchesPlan,
  inspectDatabase,
  insertDraftContent,
  publishDraft,
  reserveExampleIds,
  resolveDraftExampleIds,
  rollbackDatabase,
} from "./database";
import { sameValue, sha256, verifyPreparedPlan, type PublishPlan } from "./plan";
import {
  buildStorageObjects,
  stageStorage,
  verifyAllRemoteObjects,
  type StorageObjectPlan,
  type StoragePort,
} from "./storage";

type Sql = ReturnType<typeof postgres>;
type Json = Record<string, unknown>;

export interface ApplyManifest {
  schemaVersion: 1;
  series: string;
  status:
    | "prepared"
    | "ids-reserved"
    | "draft-inserted"
    | "uploading"
    | "uploaded"
    | "applied"
    | "rolling-back"
    | "rollback-failed"
    | "rolled-back"
    | "rolled-back-storage-retained"
    | "failed";
  createdAt: string;
  updatedAt: string;
  databaseHostFingerprint: string;
  storageBackend: "r2" | "supabase";
  storageTargetFingerprint: string;
  planFile: string;
  planSha256: string;
  categoryExistedBefore: boolean;
  categoryBefore: Json | null;
  resolvedExampleIds: Record<string, string>;
  storageObjects: StorageObjectPlan[];
  failure?: string;
  appliedAt?: string;
  rolledBackAt?: string;
}

/** Which database and Storage this run is pointed at. */
export type PublishTarget = {
  hostFingerprint: string;
  storageBackend: "r2" | "supabase";
  storageFingerprint: string;
};

export type PublishRequest =
  | { mode: "dry-run" }
  | { mode: "apply"; confirmHost?: string | null; confirmStorage?: string | null; resume?: string | null }
  | { mode: "rollback"; manifest: string; confirmHost?: string | null; confirmStorage?: string | null };

export type PublishDeps = {
  sql: Sql;
  storage: StoragePort;
  target: PublishTarget;
  /** Repository root every plan path is relative to. */
  root: string;
  log?: (line: string) => void;
};

export type PublishOutcome = {
  mode: PublishRequest["mode"];
  status: "dry-run" | ApplyManifest["status"];
  manifestFile: string | null;
  preflight: Json | null;
};

/** Identifies the logical database without persisting credentials. Hostname
 * alone is not enough when several databases or users share one server. */
export function databaseHostFingerprint(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  return sha256(
    `${parsed.protocol}//${parsed.username}@${parsed.hostname}:${parsed.port}/${parsed.pathname.replace(/^\//, "")}`,
  ).slice(0, 12);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJsonAtomic(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function assertWriteConfirmation(
  confirmHost: string | null | undefined,
  confirmStorage: string | null | undefined,
  hostFingerprint: string,
  storageFingerprint: string,
) {
  if (confirmHost !== hostFingerprint) {
    throw new Error(`write refused: pass --confirm-host ${hostFingerprint} from a fresh dry run`);
  }
  if (confirmStorage !== storageFingerprint) {
    throw new Error(`write refused: pass --confirm-storage ${storageFingerprint} from a fresh dry run`);
  }
}

/** Load and verify a plan file. Anything it pins — reviewed sources, local
 * media, the publisher's own code — must be unchanged since preparation. */
export function loadPlan(planFile: string, root: string) {
  const planBytes = fs.readFileSync(planFile);
  const plan = JSON.parse(planBytes.toString("utf8")) as PublishPlan;
  const { planSha256 } = verifyPreparedPlan(plan, planBytes, root);
  return { plan, planSha256 };
}

export async function publishRelease(
  planFile: string,
  request: PublishRequest,
  deps: PublishDeps,
): Promise<PublishOutcome> {
  const { sql, storage, target, root } = deps;
  const relative = (file: string) => path.relative(root, file).split(path.sep).join("/");
  const { plan, planSha256 } = loadPlan(planFile, root);
  const log = (line: string) => (deps.log ?? console.log)(`[${plan.series}:publish] ${line}`);
  if (plan.databasePreflight?.databaseHostFingerprint !== target.hostFingerprint ||
      plan.storageTarget?.fingerprint !== target.storageFingerprint) {
    throw new Error("publish plan targets differ from its reviewed database or physical Storage preflight");
  }

  if (request.mode === "rollback") {
    const manifestFile = path.resolve(root, request.manifest);
    const manifest = readJson<ApplyManifest>(manifestFile);
    if (manifest.schemaVersion !== 1 || manifest.series !== plan.series) {
      throw new Error(`invalid ${plan.series} recovery manifest`);
    }
    if (manifest.databaseHostFingerprint !== target.hostFingerprint) {
      throw new Error("rollback manifest belongs to a different logical database");
    }
    assertWriteConfirmation(
      request.confirmHost, request.confirmStorage,
      manifest.databaseHostFingerprint, manifest.storageTargetFingerprint,
    );
    if (manifest.storageBackend !== target.storageBackend) {
      throw new Error("rollback refused: Storage backend differs from the apply manifest");
    }
    if (manifest.storageTargetFingerprint !== target.storageFingerprint) {
      throw new Error("rollback refused: physical Storage target differs from the apply manifest");
    }
    if (![
      "draft-inserted", "uploading", "uploaded", "applied", "failed", "rolling-back", "rollback-failed",
    ].includes(manifest.status)) {
      throw new Error(`rollback refused from manifest status ${manifest.status}`);
    }
    if (sha256(fs.readFileSync(planFile)) !== manifest.planSha256) {
      throw new Error("rollback refused: publish plan digest changed");
    }
    manifest.status = "rolling-back";
    manifest.updatedAt = new Date().toISOString();
    writeJsonAtomic(manifestFile, manifest);
    try {
      await rollbackDatabase(sql, plan, manifest);
      // Immutable content-addressed objects are intentionally retained. Their
      // manifest is the cleanup inventory; deleting here would require proving
      // cross-run ownership, which object stores cannot do atomically.
      manifest.status = "rolled-back-storage-retained";
      manifest.rolledBackAt = new Date().toISOString();
      manifest.updatedAt = manifest.rolledBackAt;
      writeJsonAtomic(manifestFile, manifest);
      log(
        `rolled back ${plan.entries.length} words; ` +
          `${manifest.storageObjects.filter(({ uploadedByRun }) => uploadedByRun).length} ` +
          `content-addressed Storage objects retained for separately audited cleanup`,
      );
      return { mode: "rollback", status: manifest.status, manifestFile, preflight: null };
    } catch (error) {
      manifest.status = "rollback-failed";
      manifest.failure = error instanceof Error ? error.message : String(error);
      manifest.updatedAt = new Date().toISOString();
      writeJsonAtomic(manifestFile, manifest);
      throw error;
    }
  }

  const preflight = await sql.begin("read only", (tx) => inspectDatabase(tx as unknown as Sql, plan));
  const summary = {
    mode: request.mode,
    databaseHostFingerprint: target.hostFingerprint,
    storageBackend: target.storageBackend,
    storageTargetFingerprint: target.storageFingerprint,
    words: plan.summary.words,
    examples: plan.summary.examples,
    storageObjects: plan.summary.storageObjects,
    missingTables: preflight.missingTables,
    candidateRows: preflight.words.length,
    candidateStates: Object.fromEntries(
      [...new Set(preflight.words.map((row) => String(row.status)))].map((status) => [
        status,
        preflight.words.filter((row) => row.status === status).length,
      ]),
    ),
    headwordConflicts: preflight.headwordConflicts.length,
    japaneseConflicts: preflight.japaneseConflicts.length,
    spanCollisions: preflight.spanCollisions.length,
    categoryExists: Boolean(preflight.category),
    categoryMatches: preflight.categoryMatches,
    categoryTranslationMatches: preflight.categoryTranslationMatches,
    writeReady: preflight.writeReady,
  };
  (deps.log ?? console.log)(JSON.stringify(summary, null, 2));
  if (!preflight.writeReady) throw new Error("database preflight failed");
  if (request.mode === "dry-run") {
    log(
      `dry run only; no Storage or database changes. ` +
        `A separately authorized apply must pass --apply ` +
        `--confirm-host ${target.hostFingerprint} ` +
        `--confirm-storage ${target.storageFingerprint}`,
    );
    return { mode: "dry-run", status: "dry-run", manifestFile: null, preflight: summary };
  }

  assertWriteConfirmation(request.confirmHost, request.confirmStorage, target.hostFingerprint, target.storageFingerprint);
  const resumeFile = request.resume ? path.resolve(root, request.resume) : null;
  const directory = path.dirname(planFile);
  if (!resumeFile) {
    // An interrupted Storage phase may leave no database rows. It must still
    // resume its original journal rather than reserve a second set of IDs.
    const unfinished = fs.readdirSync(directory)
      .filter((file) => /^apply-manifest-.*\.json$/.test(file))
      .find((file) => {
        const prior = readJson<ApplyManifest>(path.join(directory, file));
        return prior.series === plan.series &&
          prior.databaseHostFingerprint === target.hostFingerprint &&
          !["applied", "rolled-back", "rolled-back-storage-retained"].includes(prior.status);
      });
    if (unfinished) {
      throw new Error(`unfinished publication exists: resume ${relative(path.join(directory, unfinished))} with --resume`);
    }
  }
  if (preflight.alreadyPublished && !resumeFile) {
    throw new Error(`all ${plan.series} rows are already published; use the audit workflow instead`);
  }
  if (preflight.resumableDraft) {
    throw new Error(
      `committed ${plan.series} drafts are from an obsolete publisher flow; rollback them before continuing`,
    );
  }

  const prior = resumeFile ? readJson<ApplyManifest>(resumeFile) : null;
  if (prior && (prior.schemaVersion !== 1 || prior.series !== plan.series)) {
    throw new Error(`invalid ${plan.series} recovery manifest`);
  }
  const manifestFile = resumeFile ?? path.join(
    directory,
    `apply-manifest-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  const manifest: ApplyManifest = prior ?? {
    schemaVersion: 1,
    series: plan.series,
    status: "prepared",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    databaseHostFingerprint: target.hostFingerprint,
    storageBackend: target.storageBackend,
    storageTargetFingerprint: target.storageFingerprint,
    planFile: relative(planFile),
    planSha256,
    categoryExistedBefore: Boolean(preflight.category),
    categoryBefore: preflight.category,
    resolvedExampleIds: {},
    storageObjects: [],
  };
  const journal = () => writeJsonAtomic(manifestFile, manifest);
  if (prior) {
    if (manifest.databaseHostFingerprint !== target.hostFingerprint) {
      throw new Error("resume manifest belongs to a different logical database");
    }
    if (manifest.storageBackend !== target.storageBackend) {
      throw new Error("resume refused: Storage backend differs from the apply manifest");
    }
    if (manifest.storageTargetFingerprint !== target.storageFingerprint) {
      throw new Error("resume refused: physical Storage target differs from the apply manifest");
    }
    if (manifest.planSha256 !== planSha256) {
      throw new Error("resume refused: publish plan digest changed");
    }
    if (!["prepared", "ids-reserved", "uploading", "uploaded", "failed"].includes(manifest.status)) {
      throw new Error(`resume refused from manifest status ${manifest.status}`);
    }
  } else {
    journal();
  }
  try {
    if (preflight.newSeries && Object.keys(manifest.resolvedExampleIds).length === 0) {
      manifest.resolvedExampleIds = await reserveExampleIds(sql, plan);
    } else if (preflight.alreadyPublished) {
      const resolved = await resolveDraftExampleIds(sql, plan);
      if (!sameValue(resolved, manifest.resolvedExampleIds)) {
        throw new Error("resume refused: stored example identity differs from the manifest");
      }
    }
    const expectedStorageObjects = buildStorageObjects(plan, manifest.resolvedExampleIds);
    if (manifest.storageObjects.length === 0) {
      manifest.storageObjects = expectedStorageObjects;
    } else {
      const identity = ({ key, bucket, storagePath, url, localFile, bytes, contentSha256, mimeType }: StorageObjectPlan) =>
        ({ key, bucket, storagePath, url, localFile, bytes, contentSha256, mimeType });
      assertRowSet(
        "manifest Storage plan",
        manifest.storageObjects.map(identity),
        expectedStorageObjects.map(identity),
      );
    }
    if (preflight.alreadyPublished) {
      await verifyAllRemoteObjects(storage, manifest.storageObjects);
      await sql.begin((tx) =>
        assertStoredContentMatchesPlan(tx, plan, manifest.resolvedExampleIds, manifest, "published"),
      );
      manifest.status = "applied";
      manifest.failure = undefined;
      manifest.appliedAt ??= new Date().toISOString();
      manifest.updatedAt = new Date().toISOString();
      journal();
      log(`recovered completed publication; manifest: ${relative(manifestFile)}`);
      return { mode: "apply", status: manifest.status, manifestFile, preflight: summary };
    }
    manifest.status = "ids-reserved";
    manifest.failure = undefined;
    manifest.updatedAt = new Date().toISOString();
    journal();
    await stageStorage(storage, root, manifest, journal, log);
    await verifyAllRemoteObjects(storage, manifest.storageObjects);
    await sql.begin(async (tx) => {
      await insertDraftContent(tx, plan, manifest.resolvedExampleIds);
      await publishDraft(tx, plan, manifest);
    });
    manifest.status = "applied";
    manifest.appliedAt = new Date().toISOString();
    manifest.updatedAt = manifest.appliedAt;
    journal();
    log(`published ${plan.summary.words} words; manifest: ${relative(manifestFile)}`);
    return { mode: "apply", status: manifest.status, manifestFile, preflight: summary };
  } catch (error) {
    manifest.status = "failed";
    manifest.failure = error instanceof Error ? error.message : String(error);
    manifest.updatedAt = new Date().toISOString();
    journal();
    throw new Error(`${manifest.failure}; recovery manifest: ${relative(manifestFile)}`);
  }
}
