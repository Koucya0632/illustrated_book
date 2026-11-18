/** Experimental orchestration for the mixed-region publisher. There is no
 * production CLI and no concrete production database adapter in this module.
 * The concrete adapter must re-check the guard and every DB before-state in
 * one transaction. Never connect an unreviewed adapter to a live database. */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { publicObjectUrl } from "../../storage/public-objects";
import { stageStorage, verifyAllRemoteObjects, type StorageObjectPlan, type StoragePort } from "./storage";
import { verifyAustralianPlan, verifyAustralianReviews, verifyDeployedGuard, type ReviewEvidence, type GuardEvidence } from "./australia-gates";
import type { prepareAustralianPlan } from "./australia-plan";

type Plan = ReturnType<typeof prepareAustralianPlan>;
type GuardResponse = Parameters<typeof verifyDeployedGuard>[2];
type Target = { hostFingerprint: string; storageFingerprint: string; storageBackend: "r2" | "supabase"; apiBase: string };
export type AustraliaManifest = {
  version: 1; journalId: string; status: string; createdAt: string; updatedAt: string; planDigest: string; planFileSha256: string;
  target: Target; beforeStateDigest: string; resolvedExampleIds: Record<string, string>; storageObjects: StorageObjectPlan[]; failure?: string;
  listeningEvidence: ListeningJournalEvidence;
};
type ListeningJournalEvidence =
  | { kind: "user-waived-listening"; planDigest: string; items: { key: string; digest: string }[] }
  | { kind: "listening-reviewed"; decisions: ReviewEvidence["audio"] };
export function journalListeningEvidence(reviews: ReviewEvidence): ListeningJournalEvidence {
  const waiver = reviews.listeningWaiver;
  return waiver
    ? { kind: "user-waived-listening", planDigest: waiver.planDigest, items: waiver.items.map(({ key, digest }) => ({ key, digest })) }
    : { kind: "listening-reviewed", decisions: reviews.audio.map(({ key, digest, verdict, reason }) => ({ key, digest, verdict, reason })) };
}
export function verifyJournalListeningEvidence(saved: ListeningJournalEvidence, reviews: ReviewEvidence) {
  check(saved && JSON.stringify(saved) === JSON.stringify(journalListeningEvidence(reviews)), "resume listening evidence differs from original journal");
}
export type AustraliaDatabasePort = {
  /** Verify collisions, category IDs, shared-word examples and no existing AU audio. Must be read-only. */
  preflight(plan: Plan): Promise<{ ready: boolean; problems: string[]; beforeStateDigest: string }>;
  /** Resolve all new example IDs before media paths are constructed. */
  reserveExampleIds(plan: Plan): Promise<Record<string, string>>;
  /** True only if every committed DB row is identical to the journal and plan. */
  committedMatches(plan: Plan, manifest: AustraliaManifest): Promise<boolean>;
  /** One transaction; re-check guard, collision and before-state after locking,
   * write all candidate words/spans/media and existing en-AU rows, verify all
   * inserted rows, then publish reserved IDs. Must not overwrite shared cards. */
  applyAtomic(plan: Plan, manifest: AustraliaManifest): Promise<void>;
};
export type AustraliaRunDeps = {
  root: string; database: AustraliaDatabasePort; storage: StoragePort; target: Target;
  freshGuard: () => Promise<GuardResponse>; log?: (line: string) => void;
  /** Isolated-test ownership integration only. Production remains unavailable. */
  testOwnership?: {
    assertHeld(): Promise<void>;
    reserve(manifestFile: string, manifest: AustraliaManifest): Promise<void>;
    prepareResume(manifestFile: string): Promise<void>;
    activate(manifestFile: string, manifest: AustraliaManifest): Promise<void>;
  };
};
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function writeAtomic(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" }); fs.renameSync(temp, file);
}
function targetEqual(a: Target, b: Target) { return JSON.stringify(a) === JSON.stringify(b); }
function objects(plan: Plan): StorageObjectPlan[] {
  const rows = plan.artifacts.map((a) => ({ key: `${a.bucket}|${a.proposedStoragePath}`, bucket: a.bucket,
    storagePath: a.proposedStoragePath, url: publicObjectUrl(a.bucket, a.proposedStoragePath), localFile: a.localFile,
    bytes: a.bytes, contentSha256: a.sha256, mimeType: a.mimeType,
    existedBefore: false, uploadedByRun: false, uploadIntent: false, verified: false }));
  check(new Set(rows.map((row) => row.key)).size === plan.artifacts.length, "duplicate storage object plan");
  return rows;
}
function verifyManifest(manifest: AustraliaManifest, plan: Plan, planFileSha256: string, target: Target, reviews: ReviewEvidence) {
  check(manifest.version === 1 && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(manifest.journalId) && manifest.planDigest === plan.planDigest && manifest.planFileSha256 === planFileSha256 && targetEqual(manifest.target, target), "resume manifest does not match plan or physical targets");
  verifyJournalListeningEvidence(manifest.listeningEvidence, reviews);
  const expected = objects(plan);
  check(manifest.storageObjects.length === expected.length, "resume storage object count differs");
  for (let i = 0; i < expected.length; i++) {
    const a = manifest.storageObjects[i], b = expected[i];
    for (const key of ["key", "bucket", "storagePath", "url", "localFile", "bytes", "contentSha256", "mimeType"] as const) check(a[key] === b[key], `resume storage object differs: ${b.key}`);
  }
}

/** Default mode is read-only. Apply requires separately reviewed evidence,
 * exact target confirmation, fresh public guard plus authenticated/fleet
 * evidence, and an injected (currently test-only) transactional DB port. */
export async function runAustralianPublisher(
  planFile: string,
  request: { mode?: "dry-run" } | { mode: "apply"; confirmHost: string; confirmStorage: string; manifestDirectory: string; resume?: string },
  evidence: { reviews: ReviewEvidence; guard: GuardEvidence },
  deps: AustraliaRunDeps,
) {
  const bytes = fs.readFileSync(planFile), plan = JSON.parse(bytes.toString("utf8")) as Plan, planSha = hash(bytes);
  verifyAustralianPlan(plan);
  const prior = await deps.database.preflight(plan);
  if (request.mode !== "apply") return { mode: "dry-run", preflight: prior, target: deps.target };
  check(request.confirmHost === deps.target.hostFingerprint && request.confirmStorage === deps.target.storageFingerprint, "database or storage target confirmation differs");
  check(new URL(deps.target.apiBase).protocol === "https:", "production guard base must use HTTPS");
  verifyAustralianReviews(plan, evidence.reviews);
  verifyDeployedGuard(plan, evidence.guard, await deps.freshGuard());
  // Test hook checks ownership around network calls; this cannot cancel or
  // fence a PUT already in flight after the dedicated session is lost.
  const guardedStorage: StoragePort = deps.testOwnership ? {
    list: async (bucket) => { await deps.testOwnership!.assertHeld(); const result=await deps.storage.list(bucket); await deps.testOwnership!.assertHeld(); return result; },
    put: async (bucket,key,bytes,mime) => { await deps.testOwnership!.assertHeld(); const result=await deps.storage.put(bucket,key,bytes,mime); await deps.testOwnership!.assertHeld(); return result; },
    fetch: async (url) => { await deps.testOwnership!.assertHeld(); const result=await deps.storage.fetch(url); await deps.testOwnership!.assertHeld(); return result; },
  } : deps.storage;
  const dir = path.resolve(request.manifestDirectory);
  fs.mkdirSync(dir, { recursive: true });
  let manifestFile: string, manifest: AustraliaManifest;
  if (request.resume) {
    manifestFile = path.resolve(request.resume);
    await deps.testOwnership?.prepareResume(manifestFile);
    manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as AustraliaManifest;
    verifyManifest(manifest, plan, planSha, deps.target, evidence.reviews);
    check(["prepared", "ids-reserved", "uploading", "uploaded", "failed", "database-committed-awaiting-activation"].includes(manifest.status), "invalid recovery state");
    await deps.testOwnership?.activate(manifestFile, manifest);
    if (manifest.status === "database-committed-awaiting-activation") {
      check(await deps.database.committedMatches(plan, manifest), "applied journal differs from database");
      await verifyAllRemoteObjects(guardedStorage, manifest.storageObjects);
      return { mode: "apply", status: "database-committed-awaiting-activation", manifestFile };
    }
  } else {
    for (const name of fs.readdirSync(dir).filter((name) => name.startsWith("australia-apply-") && name.endsWith(".json"))) {
      const earlier = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as AustraliaManifest;
      check(earlier.planDigest !== plan.planDigest || ["database-committed-awaiting-activation", "rolled-back-storage-retained"].includes(earlier.status), "unfinished publication exists; resume its original journal");
    }
    check(prior.ready && !prior.problems.length, "fresh database preflight failed");
    const at = new Date().toISOString();
    const journalId = randomUUID();
    manifest = { version: 1, journalId, status: "prepared", createdAt: at, updatedAt: at, planDigest: plan.planDigest, planFileSha256: planSha, target: deps.target, beforeStateDigest: prior.beforeStateDigest, resolvedExampleIds: {}, storageObjects: objects(plan), listeningEvidence: journalListeningEvidence(evidence.reviews) };
    manifestFile = path.join(dir, `australia-apply-${journalId}.json`);
    await deps.testOwnership?.reserve(manifestFile, manifest);
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    await deps.testOwnership?.activate(manifestFile, manifest);
  }
  const journal = () => { manifest.updatedAt = new Date().toISOString(); writeAtomic(manifestFile, manifest); };
  try {
    await deps.testOwnership?.assertHeld();
    if (await deps.database.committedMatches(plan, manifest)) {
      await verifyAllRemoteObjects(guardedStorage, manifest.storageObjects);
      manifest.status = "database-committed-awaiting-activation"; delete manifest.failure; journal(); return { mode: "apply", status: manifest.status, manifestFile };
    }
    check(prior.ready && !prior.problems.length && prior.beforeStateDigest === manifest.beforeStateDigest, "fresh database preflight differs from the journal before staging");
    if (!Object.keys(manifest.resolvedExampleIds).length) {
      manifest.resolvedExampleIds = await deps.database.reserveExampleIds(plan);
      await deps.testOwnership?.assertHeld();
      check(Object.keys(manifest.resolvedExampleIds).length === plan.newWordIds.length * 2 && new Set(Object.values(manifest.resolvedExampleIds)).size === plan.newWordIds.length * 2, "reserved example IDs incomplete or duplicated");
      manifest.status = "ids-reserved"; journal();
    }
    await stageStorage(guardedStorage, deps.root, manifest, journal, deps.log ?? (() => {}));
    await deps.testOwnership?.assertHeld();
    await verifyAllRemoteObjects(guardedStorage, manifest.storageObjects);
    verifyAustralianPlan(plan);
    verifyAustralianReviews(plan, evidence.reviews);
    verifyDeployedGuard(plan, evidence.guard, await deps.freshGuard());
    await deps.testOwnership?.assertHeld();
    await deps.database.applyAtomic(plan, manifest);
    await deps.testOwnership?.assertHeld();
    check(await deps.database.committedMatches(plan, manifest), "database does not match published journal");
    manifest.status = "database-committed-awaiting-activation"; delete manifest.failure; journal();
    return { mode: "apply", status: manifest.status, manifestFile };
  } catch (error) {
    await deps.testOwnership?.assertHeld();
    manifest.status = "failed"; manifest.failure = error instanceof Error ? error.message : String(error); journal();
    throw new Error(`publication failed; recovery manifest: ${manifestFile}`, { cause: error });
  }
}
