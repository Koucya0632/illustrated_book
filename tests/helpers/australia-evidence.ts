import { createHash } from "node:crypto";
import fs from "node:fs";
import type { prepareAustralianPlan } from "../../lib/catalogue/publish/australia-plan";
import type { ReviewEvidence, GuardEvidence } from "../../lib/catalogue/publish/australia-gates";
const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const pass = (key: string, digest: string) => ({ key, digest, verdict: "pass" as const, reason: "synthetic test-only evidence" });
export function syntheticEvidence(plan: ReturnType<typeof prepareAustralianPlan>) {
  const pkg = JSON.parse(fs.readFileSync(plan.sourcePins.reviewPackage.file, "utf8"));
  const snaps = JSON.parse(fs.readFileSync(plan.sourcePins.existingSnapshots.file, "utf8"));
  const opal = pkg.opalRegionalCandidate;
  const reviews: ReviewEvidence = {
    schemaVersion: 1, planDigest: plan.planDigest,
    categories: plan.newWordIds.map((id) => pass(id, hash({id, category:plan.categoryAssignments[id]}))),
    topic: [pass(plan.newCategory.id, hash({topic:plan.newCategory, coverSha256:plan.artifacts.find((a)=>a.owner===plan.newCategory.imageOwner&&a.role==="image")!.sha256}))],
    japanBaseline: [pass("transit-ic-card", hash({guard:plan.sourcePins.japanTransitGuardBaseline.sha256, database:plan.sourcePins.japanTransitDatabaseSnapshot.sha256, media:plan.sourcePins.japanTransitMediaEvidence.sha256}))],
    words: [...pkg.wordEntries.map((r: any) => pass(r.id, hash(r.candidate))), pass("transit-ic-card:au", hash(opal.candidate))],
    ipa: [...pkg.wordEntries.map((r: any) => pass(r.id, hash({word:r.candidate.word,pronunciation:r.candidate.pronunciation}))), pass("transit-ic-card:au", hash({word:opal.candidate.word,pronunciation:opal.candidate.pronunciation}))],
    examples: [...pkg.wordEntries.flatMap((r: any) => [0,1].map((slot) => pass(`${r.id}:${slot}`,hash({example:r.candidate.examples[slot],spans:r.spans.filter((s: any)=>s.order===slot)})))), ...[0,1].map((slot) => pass(`transit-ic-card:au:${slot}`,hash({example:opal.candidate.examples[slot],spans:opal.spans.filter((s: any)=>s.order===slot)})))],
    existing: plan.existingAudioOwners.map((id) => pass(id, hash(snaps[id]))),
    images: plan.artifacts.filter((a)=>a.bucket==="word-images").map((a)=>pass(`${a.owner}|${a.role}`,a.sha256)),
    audio: plan.artifacts.filter((a)=>a.bucket==="word-audio").map((a)=>pass(`${a.owner}|${a.role}|${a.locale}`,a.sha256)),
  };
  const now = new Date().toISOString(), commit = "1".repeat(40), ids = hash([...plan.reservedIds].sort()), config=hash([{},plan.reservedIds,{}]);
  const guard: GuardEvidence={ expectedCommit:commit,expectedConfigurationSha256:config,auditedAt:now,
    publicAudit:{problems:[],checkedIds:plan.reservedIds.length,directionsProbed:["zh-en","zh-ja"]},
    authenticatedAudit:{commit,reservedIdsSha256:ids,checkedAt:now,checks:["study:zh-en","study:zh-ja","review:zh-en","review:zh-ja","lists:zh-en","lists:zh-ja"],verdict:"pass"},
    fleetAudit:{commit,configurationSha256:config,checkedAt:now,verdict:"pass",reason:"synthetic test-only fleet"} };
  const response={status:200,headers:{"cache-control":"no-store","vercel-cdn-cache-control":"no-store"},body:{guardProtocol:"tuji-australia-catalogue-v2",deploymentCommit:commit,reservedIdCount:plan.reservedIds.length,reservedIdsSha256:ids,configurationSha256:config}};
  return {reviews,guard,response};
}
