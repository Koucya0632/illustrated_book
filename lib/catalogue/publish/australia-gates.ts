import { createHash } from "node:crypto";
import fs from "node:fs";
import { digest } from "./plan";
import type { prepareAustralianPlan } from "./australia-plan";

type Plan = ReturnType<typeof prepareAustralianPlan>;
type Decision = { key: string; digest: string; verdict: "pass" | "fail" | "uncertain"; reason: string };
export type ListeningWaiver = {
  decision: "user-waived-listening";
  planDigest: string;
  items: { key: string; digest: string }[];
};
export type ReviewEvidence = {
  schemaVersion: 1;
  planDigest: string;
  words: Decision[];
  categories: Decision[];
  topic: Decision[];
  examples: Decision[];
  ipa: Decision[];
  existing: Decision[];
  japanBaseline: Decision[];
  images: Decision[];
  audio: Decision[];
  listeningWaiver?: ListeningWaiver;
};
export type GuardEvidence = {
  expectedCommit: string;
  expectedConfigurationSha256: string;
  auditedAt: string;
  publicAudit: { problems: string[]; checkedIds: number; directionsProbed: string[] };
  authenticatedAudit: { commit: string; reservedIdsSha256: string; checkedAt: string; checks: string[]; verdict: string };
  fleetAudit: { commit: string; configurationSha256: string; checkedAt: string; verdict: string; reason: string };
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function fail(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function requireDecisions(name: string, actual: Decision[], expected: Map<string, string>) {
  fail(Array.isArray(actual) && actual.length === expected.size, `${name}: incomplete review coverage`);
  const seen = new Set<string>();
  for (const row of actual) {
    fail(!seen.has(row.key) && expected.get(row.key) === row.digest && row.verdict === "pass" && typeof row.reason === "string" && row.reason.trim().length > 0, `${name}: missing, stale or unapproved item ${row.key}`);
    seen.add(row.key);
  }
}

/** A waiver is not a listening verdict. It must cover exactly the audio in
 * this plan and cannot be combined with purported listening decisions. */
export function requireListeningEvidence(planDigest: string, actual: Decision[], expected: Map<string, string>, waiver?: ListeningWaiver) {
  if (!waiver) return requireDecisions("listening", actual, expected);
  fail(waiver.decision === "user-waived-listening" && waiver.planDigest === planDigest && Array.isArray(actual) && actual.length === 0 && Array.isArray(waiver.items) && waiver.items.length === expected.size, "listening waiver: invalid scope or mixed evidence");
  const seen = new Set<string>();
  for (const item of waiver.items) {
    fail(!seen.has(item.key) && expected.has(item.key) && expected.get(item.key) === item.digest, `listening waiver: missing, duplicate or stale item ${item.key}`);
    seen.add(item.key);
  }
}

/** Re-check the immutable local source and every planned file immediately
 * before any production operation. No case-folded or abbreviated hashes. */
export function verifyAustralianPlan(plan: Plan) {
  const { planDigest, createdAt: _createdAt, summary: _summary, databasePreflight: _databasePreflight, ...content } = plan as Plan & { databasePreflight?: unknown };
  fail(plan.schemaVersion === 1 && plan.kind === "australian-mixed-atlas" && plan.productionWriteAllowed === false && digest(content) === planDigest, "plan digest or schema differs");
  for (const [key, source] of Object.entries(plan.sourcePins)) {
    fail(sha256(fs.readFileSync(source.file)) === source.sha256, `${key}: pinned source changed`);
  }
  for (const artifact of plan.artifacts) {
    const bytes = fs.readFileSync(artifact.localFile);
    fail(bytes.length === artifact.bytes && sha256(bytes) === artifact.sha256, `${artifact.owner}: pinned media changed`);
  }
}

/** Reviews are keyed to exact selected source bytes/content, not a batch-level
 * checkbox or speech-to-text. A user waiver is recorded separately from a
 * listening verdict and is limited to the exact planned audio. */
export function verifyAustralianReviews(plan: Plan, evidence: ReviewEvidence) {
  fail(evidence?.schemaVersion === 1 && evidence.planDigest === plan.planDigest, "review evidence belongs to another plan");
  if (plan.gates.audioListening === "waived-by-user-not-listened") {
    fail(evidence.listeningWaiver?.decision === "user-waived-listening", "plan requires the recorded user listening waiver");
  }
  const pkg = JSON.parse(fs.readFileSync(plan.sourcePins.reviewPackage.file, "utf8"));
  const words = new Map<string, string>(), examples = new Map<string, string>(), ipa = new Map<string, string>();
  for (const row of pkg.wordEntries) {
    words.set(row.id, hash(row.candidate));
    ipa.set(row.id, hash({ word: row.candidate.word, pronunciation: row.candidate.pronunciation }));
    for (const slot of [0, 1]) examples.set(`${row.id}:${slot}`, hash({ example: row.candidate.examples[slot], spans: row.spans.filter((s: { order: number }) => s.order === slot) }));
  }
  const opal = pkg.opalRegionalCandidate;
  words.set("transit-ic-card:au", hash(opal.candidate));
  ipa.set("transit-ic-card:au", hash({ word: opal.candidate.word, pronunciation: opal.candidate.pronunciation }));
  for (const slot of [0, 1]) examples.set(`transit-ic-card:au:${slot}`, hash({ example: opal.candidate.examples[slot], spans: opal.spans.filter((s: { order: number }) => s.order === slot) }));
  const snapshots = JSON.parse(fs.readFileSync(plan.sourcePins.existingSnapshots.file, "utf8"));
  const existing = new Map(plan.existingAudioOwners.map((id) => [id, hash(snapshots[id])]));
  const images = new Map(plan.artifacts.filter((a) => a.bucket === "word-images").map((a) => [`${a.owner}|${a.role}`, a.sha256]));
  const audio = new Map(plan.artifacts.filter((a) => a.bucket === "word-audio").map((a) => [`${a.owner}|${a.role}|${a.locale}`, a.sha256]));
  fail(images.size === plan.artifacts.filter((a) => a.bucket === "word-images").length && audio.size === plan.artifacts.filter((a) => a.bucket === "word-audio").length, "review keys collide");
  const categories = new Map(plan.newWordIds.map((id) => [id, hash({ id, category: plan.categoryAssignments[id] })]));
  requireDecisions("word", evidence.words, words);
  requireDecisions("category", evidence.categories, categories);
  const cover=plan.artifacts.find((a)=>a.owner===plan.newCategory.imageOwner&&a.role==="image");
  fail(cover, "new topic cover missing");
  requireDecisions("new topic", evidence.topic, new Map([[plan.newCategory.id, hash({topic:plan.newCategory, coverSha256:cover.sha256})]]));
  requireDecisions("example", evidence.examples, examples);
  requireDecisions("IPA", evidence.ipa, ipa);
  requireDecisions("existing words", evidence.existing, existing);
  requireDecisions("Japan transit baseline", evidence.japanBaseline, new Map([["transit-ic-card", hash({guard:plan.sourcePins.japanTransitGuardBaseline.sha256, database:plan.sourcePins.japanTransitDatabaseSnapshot.sha256, media:plan.sourcePins.japanTransitMediaEvidence.sha256})]]));
  requireDecisions("image", evidence.images, images);
  requireListeningEvidence(plan.planDigest, evidence.audio, audio, evidence.listeningWaiver);
}

/** The caller obtains guardResponse by a fresh HTTPS no-store fetch from the
 * selected target. Authenticated and fleet checks are separate evidence: a
 * public endpoint alone cannot establish that every route or instance is safe. */
export function verifyDeployedGuard(plan: Plan, evidence: GuardEvidence, guardResponse: {
  status: number; headers: Record<string, string | null>; body: { guardProtocol: string; deploymentCommit: string | null; reservedIdCount: number; reservedIdsSha256: string; configurationSha256: string };
}, now = Date.now()) {
  fail(/^[a-f0-9]{40}$/.test(evidence.expectedCommit), "missing full reviewed deployment commit");
  const idsHash = hash([...plan.reservedIds].sort());
  const configHash = hash([{}, plan.reservedIds, {}]);
  const { status, headers, body } = guardResponse;
  fail(status === 200 && body.guardProtocol === "tuji-australia-catalogue-v2" && body.deploymentCommit === evidence.expectedCommit && body.reservedIdCount === plan.reservedIds.length && body.reservedIdsSha256 === idsHash && body.configurationSha256 === configHash && evidence.expectedConfigurationSha256 === configHash, "deployed region guard differs from the reviewed empty configuration");
  fail(/\bno-store\b/i.test(headers["cache-control"] ?? ""), "guard response lacks client no-store");
  const recent = (timestamp: string) => { const t = Date.parse(timestamp); return Number.isFinite(t) && t <= now && now - t <= 30 * 60 * 1000; };
  fail(recent(evidence.auditedAt) && evidence.publicAudit?.problems?.length === 0 && evidence.publicAudit.checkedIds === plan.reservedIds.length && ["zh-en", "zh-ja"].every((x) => evidence.publicAudit.directionsProbed.includes(x)), "public route audit incomplete or stale");
  const auth = evidence.authenticatedAudit;
  fail(auth?.verdict === "pass" && auth.commit === evidence.expectedCommit && auth.reservedIdsSha256 === idsHash && recent(auth.checkedAt) && ["study:zh-en", "study:zh-ja", "review:zh-en", "review:zh-ja", "lists:zh-en", "lists:zh-ja"].every((x) => auth.checks.includes(x)), "authenticated region route audit incomplete or stale");
  const fleet = evidence.fleetAudit;
  fail(fleet?.verdict === "pass" && fleet.commit === evidence.expectedCommit && fleet.configurationSha256 === configHash && recent(fleet.checkedAt) && typeof fleet.reason === "string" && fleet.reason.trim().length > 0, "fleet or cache convergence audit incomplete or stale");
}
