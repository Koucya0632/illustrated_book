import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { requireListeningEvidence, verifyAustralianReviews, type ListeningWaiver } from "../lib/catalogue/publish/australia-gates";
import { prepareAustralianPlan } from "../lib/catalogue/publish/australia-plan";
import { syntheticEvidence } from "./helpers/australia-evidence";
import { journalListeningEvidence, verifyJournalListeningEvidence, runAustralianPublisher, type AustraliaDatabasePort } from "../lib/catalogue/publish/australia-journal";
import { memoryStorage, FIXTURE_ASSET_BASE } from "./helpers/release-fixture";

test("listening waiver is scoped to the exact plan and clips, without marking them reviewed", () => {
  const expected = new Map([["one|headword|en-AU", "hash-one"], ["two|example|ja-JP", "hash-two"]]);
  const waiver: ListeningWaiver = {
    decision: "user-waived-listening", planDigest: "plan-a",
    items: [...expected].map(([key, digest]) => ({ key, digest })),
  };
  assert.doesNotThrow(() => requireListeningEvidence("plan-a", [], expected, waiver));
  assert.throws(() => requireListeningEvidence("plan-b", [], expected, waiver), /invalid scope/);
  assert.throws(() => requireListeningEvidence("plan-a", [], expected, { ...waiver, items: waiver.items.slice(0, 1) }), /invalid scope/);
  assert.throws(() => requireListeningEvidence("plan-a", [], expected, { ...waiver, items: [waiver.items[0], waiver.items[0]] }), /duplicate/);
  assert.throws(() => requireListeningEvidence("plan-a", [], expected, { ...waiver, items: [waiver.items[0], { ...waiver.items[1], digest: "changed" }] }), /stale/);
  assert.throws(() => requireListeningEvidence("plan-a", [{ ...waiver.items[0], verdict: "pass", reason: "heard" }], expected, waiver), /mixed evidence/);
  assert.throws(() => requireListeningEvidence("plan-a", [], expected), /incomplete review coverage/);
});

test("interrupted apply records the waiver and refuses changed resume evidence", {
  skip: !process.env.AU_REVIEW_SOURCE || !process.env.AU_RESERVED_IDS || !fs.existsSync(process.env.AU_REVIEW_SOURCE) || !fs.existsSync(process.env.AU_RESERVED_IDS),
}, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tuji-listening-journal-"));
  const priorAssetBase = process.env.NEXT_PUBLIC_ASSET_BASE_URL;
  process.env.NEXT_PUBLIC_ASSET_BASE_URL = FIXTURE_ASSET_BASE;
  try {
    const plan = prepareAustralianPlan(process.env.AU_REVIEW_SOURCE!, process.env.AU_RESERVED_IDS!, process.cwd());
    const planFile = path.join(tmp, "plan.json");
    fs.writeFileSync(planFile, JSON.stringify(plan));
    const evidence = syntheticEvidence(plan);
    evidence.reviews.listeningWaiver = { decision: "user-waived-listening", planDigest: plan.planDigest, items: evidence.reviews.audio.map(({ key, digest }) => ({ key, digest })) };
    evidence.reviews.audio = [];
    const { storage, state } = memoryStorage();
    state.failAfterPuts = 0;
    const database: AustraliaDatabasePort = {
      async preflight() { return { ready: true, problems: [], beforeStateDigest: "test-only" }; },
      async reserveExampleIds(p) { return Object.fromEntries(p.newWordIds.flatMap(id => [0, 1].map(slot => [`${id}:${slot}`, `${id}:${slot}`]))); },
      async committedMatches() { return false; },
      async applyAtomic() { throw new Error("unexpected apply"); },
    };
    const target = { hostFingerprint: "test-db", storageFingerprint: "test-storage", storageBackend: "r2" as const, apiBase: "https://test.invalid" };
    const request = { mode: "apply" as const, confirmHost: target.hostFingerprint, confirmStorage: target.storageFingerprint, manifestDirectory: tmp };
    const deps = { root: process.cwd(), database, storage, target, freshGuard: async () => evidence.response };
    await assert.rejects(runAustralianPublisher(planFile, request, evidence, deps), /recovery manifest/);
    const journalFile = path.join(tmp, fs.readdirSync(tmp).find(name => name.startsWith("australia-apply-"))!);
    const journal = JSON.parse(fs.readFileSync(journalFile, "utf8"));
    assert.match(journal.journalId, /^[0-9a-f-]{36}$/);
    assert.equal(path.basename(journalFile), `australia-apply-${journal.journalId}.json`);
    assert.equal(journal.listeningEvidence.kind, "user-waived-listening");
    assert.equal(journal.listeningEvidence.items.length, 264);
    evidence.reviews.listeningWaiver.items.reverse(); // Still valid coverage; nevertheless different recorded evidence.
    await assert.rejects(runAustralianPublisher(planFile, { ...request, resume: journalFile }, evidence, deps), /resume listening evidence differs/);
    evidence.reviews.listeningWaiver.items.reverse();
    journal.journalId = "not-a-journal-id";
    fs.writeFileSync(journalFile, JSON.stringify(journal));
    await assert.rejects(runAustralianPublisher(planFile, { ...request, resume: journalFile }, evidence, deps), /resume manifest does not match/);
  } finally {
    if (priorAssetBase === undefined) delete process.env.NEXT_PUBLIC_ASSET_BASE_URL;
    else process.env.NEXT_PUBLIC_ASSET_BASE_URL = priorAssetBase;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("waiver passes the complete review gate only while other reviews remain valid", {
  skip: !process.env.AU_REVIEW_SOURCE || !process.env.AU_RESERVED_IDS || !fs.existsSync(process.env.AU_REVIEW_SOURCE) || !fs.existsSync(process.env.AU_RESERVED_IDS),
}, () => {
  const plan = prepareAustralianPlan(process.env.AU_REVIEW_SOURCE!, process.env.AU_RESERVED_IDS!, process.cwd(), { listeningWaivedByUser: true });
  assert.equal(plan.gates.audioListening, "waived-by-user-not-listened");
  const evidence = syntheticEvidence(plan).reviews;
  assert.throws(() => verifyAustralianReviews(plan, evidence), /requires the recorded user listening waiver/);
  const items = evidence.audio.map(({ key, digest }) => ({ key, digest }));
  assert.equal(items.length, 264);
  evidence.audio = [];
  evidence.listeningWaiver = { decision: "user-waived-listening", planDigest: plan.planDigest, items };
  assert.doesNotThrow(() => verifyAustralianReviews(plan, evidence));
  const journal = JSON.parse(JSON.stringify(journalListeningEvidence(evidence)));
  assert.equal(journal.kind, "user-waived-listening");
  assert.equal(journal.items.length, 264);
  assert.doesNotThrow(() => verifyJournalListeningEvidence(journal, evidence));
  journal.items[0].digest = "tampered";
  assert.throws(() => verifyJournalListeningEvidence(journal, evidence), /differs from original journal/);
  assert.throws(() => verifyJournalListeningEvidence(undefined!, evidence), /differs from original journal/);
  evidence.words[0].verdict = "uncertain";
  assert.throws(() => verifyAustralianReviews(plan, evidence), /word: missing, stale or unapproved/);
});
