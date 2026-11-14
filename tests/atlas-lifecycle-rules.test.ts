// Pins the 物見 lifecycle's status rules and the one 檢舉 reason list
// (lib/atlas/lifecycle-rules.ts, lib/atlas/report-reasons.ts).

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canSubmit, canWithdraw, isFinal, sharedSpotOf } from "../lib/atlas/lifecycle-rules";
import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  REPORT_REASON_VALUES,
  REPORT_TARGETS,
  TAKEDOWN_REASON_VALUES,
  reasonsFor,
  reportReason,
} from "../lib/atlas/report-reasons";
import { ATLAS_SPOT_DDL } from "../lib/atlas/spot-schema";

test("the author submits from draft, rejected or withdrawn and withdraws only what is live", () => {
  // The same sets iOS AtlasReviewStatus.canSubmit / canWithdraw draws buttons from.
  for (const s of ["draft", "rejected", "withdrawn"]) assert.ok(canSubmit(s), s);
  for (const s of ["pending", "pending_auto", "pending_review", "approved", "takedown"]) assert.ok(!canSubmit(s), s);
  assert.ok(canWithdraw("approved"));
  for (const s of ["draft", "pending_review", "rejected", "takedown", "withdrawn"]) assert.ok(!canWithdraw(s), s);
  assert.ok(isFinal("takedown") && !isFinal("withdrawn"));
});

test("a public row shows the spot only while shared and not taken off it", () => {
  assert.equal(sharedSpotOf({ spot_id: "asakusa", spot_shared: true, spot_share_revoked: null }), "asakusa");
  assert.equal(sharedSpotOf({ spot_id: "asakusa", spot_shared: false, spot_share_revoked: null }), null);
  assert.equal(sharedSpotOf({ spot_id: "asakusa", spot_shared: true, spot_share_revoked: "asakusa" }), null);
  assert.equal(sharedSpotOf({ spot_id: "ueno", spot_shared: true, spot_share_revoked: "asakusa" }), "ueno");
  assert.equal(sharedSpotOf({ spot_id: null, spot_shared: true }), null);
});

test("each reason is offered where it applies and labelled once", () => {
  assert.equal(new Set(REPORT_REASON_VALUES).size, REPORT_REASON_VALUES.length);
  for (const r of REPORT_REASONS) assert.equal(REPORT_REASON_LABELS[r.value], r.label);
  assert.deepEqual(reasonsFor("item_spot").map((r) => r.value), ["not_here"]);
  assert.ok(!reasonsFor("item").some((r) => r.value === "not_here"));
  assert.deepEqual(reasonsFor("author").map((r) => r.value), reasonsFor("collection").map((r) => r.value));
  assert.equal(reportReason("nope"), null);
  assert.ok(!TAKEDOWN_REASON_VALUES.includes("not_here"));
  assert.deepEqual(REPORT_REASONS.filter((r) => r.highRisk).map((r) => r.value), ["inappropriate", "copyright"]);
});

test("the database CHECKs allow exactly the registry, guarded on the newest value", () => {
  const ddl = ATLAS_SPOT_DDL.join("\n");
  const values = REPORT_REASON_VALUES.map((v) => `'${v}'`).join(",");
  assert.ok(ddl.includes(`CHECK (reason IN (${values}))`));
  assert.ok(ddl.includes(`LIKE '%''${REPORT_REASON_VALUES[REPORT_REASON_VALUES.length - 1]}''%'`));
  assert.ok(ddl.includes(`CHECK (target_type IN (${REPORT_TARGETS.map((v) => `'${v}'`).join(",")}))`));
});

test("no route keeps its own reason list any more", () => {
  for (const file of [
    "app/api/atlas/public/[slug]/report/route.ts",
    "app/api/atlas/public/collections/[slug]/report/route.ts",
    "app/api/atlas/public/authors/[username]/report/route.ts",
    "app/atlas/public/[slug]/ReportButton.tsx",
    "app/admin/atlas/reports/page.tsx",
  ]) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /"inappropriate"|'inappropriate'|inappropriate:/, file);
  }
});
