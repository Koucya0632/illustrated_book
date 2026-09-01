import assert from "node:assert/strict";
import test from "node:test";
import { parseAnalyticsEvent } from "../lib/analytics-event";

test("valid legacy event keeps the web platform default", () => {
  const result = parseAnalyticsEvent({ type: "view", wordId: "apple", sessionId: "s1" });
  assert.deepEqual(result, {
    ok: true,
    value: {
      type: "view",
      wordId: "apple",
      category: null,
      sessionId: "s1",
      platform: "web",
    },
  });
});

test("oversized analytics dimensions are rejected rather than truncated", () => {
  assert.deepEqual(parseAnalyticsEvent({ type: "view", wordId: "x".repeat(129) }), {
    ok: false,
    error: "invalid wordId",
  });
});

test("unknown event types and platforms are rejected", () => {
  assert.equal(parseAnalyticsEvent({ type: "made_up" }).ok, false);
  assert.deepEqual(parseAnalyticsEvent({ type: "view", platform: "watchos" }), {
    ok: false,
    error: "invalid platform",
  });
});
