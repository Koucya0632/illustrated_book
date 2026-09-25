// Pins how a multi-call AI pass (補充 = 3-4 gpt-4o-mini calls) collapses into
// the one user_atlas_ai_usage row the admin 圖鑑數據 page reads. Until 2026-09 the
// 補充 pass logged nothing, so its tokens and cost were invisible in admin.

import assert from "node:assert/strict";
import test from "node:test";
import { createAiUsageTally, estimateOpenAiCostUsd } from "../lib/atlas/ai-usage";

test("an empty tally is not worth a row", () => {
  assert.equal(createAiUsageTally().summary(), null);
});

test("sums tokens and prices each call by its own model", () => {
  const tally = createAiUsageTally();
  tally.add({ modelId: "gpt-4o-mini-2024-07-18", inputTokens: 1000, outputTokens: 500 });
  tally.add({ modelId: "gpt-4o-mini-2024-07-18", inputTokens: 2000, outputTokens: 1000 });
  const s = tally.summary();
  assert.ok(s);
  assert.equal(s.calls, 2);
  assert.equal(s.model, "gpt-4o-mini-2024-07-18");
  assert.equal(s.inputTokens, 3000);
  assert.equal(s.outputTokens, 1500);
  // gpt-4o-mini: $0.15 in / $0.60 out per MTok.
  assert.equal(s.estimatedCostUsd, estimateOpenAiCostUsd("gpt-4o-mini", 3000, 1500));
  assert.equal(s.estimatedCostUsd, 0.00135);
});

test("an unpriced model still reports its tokens", () => {
  const tally = createAiUsageTally();
  tally.add({ modelId: "some-future-model", inputTokens: 10, outputTokens: 5 });
  const s = tally.summary();
  assert.ok(s);
  assert.equal(s.inputTokens, 10);
  assert.equal(s.estimatedCostUsd, undefined);
});

test("longest prefix wins, so -mini is not priced as the base model", () => {
  assert.equal(estimateOpenAiCostUsd("gpt-4.1-mini", 1_000_000, 0), 0.4);
  assert.equal(estimateOpenAiCostUsd("gpt-4.1", 1_000_000, 0), 2);
});
