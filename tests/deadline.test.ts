import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDeadline, DeadlineError } from "../lib/deadline";

function hanging() {
  const calls = { cancelled: 0 };
  let reject: (err: Error) => void = () => {};
  const promise = new Promise<string>((_, rej) => { reject = rej; });
  return Object.assign(promise, {
    calls,
    cancel() { calls.cancelled++; reject(new Error("canceling statement due to user request")); },
  });
}

test("work that finishes in time comes back untouched", async () => {
  const d = createDeadline(1_000);
  const out = await d.run(Promise.all([d.track("a", Promise.resolve(1)), d.track("b", Promise.resolve(2))]));
  assert.deepEqual(out, [1, 2]);
});

test("past the limit it names what was still pending and cancels it", async () => {
  const d = createDeadline(30);
  const stuck = hanging();
  const err = await d
    .run(Promise.all([d.track("images", Promise.resolve([])), d.track("cards", stuck)]))
    .catch((e: unknown) => e);
  assert.ok(err instanceof DeadlineError);
  assert.deepEqual(err.pending, ["cards"]);
  assert.equal(stuck.calls.cancelled, 1);
});

test("a real error is not turned into a timeout", async () => {
  const d = createDeadline(1_000);
  await assert.rejects(d.run(d.track("a", Promise.reject(new Error("boom")))), /boom/);
});

test("repeated labels are all reported", async () => {
  const d = createDeadline(20);
  const err = await d
    .run(Promise.all([d.track("q", hanging()), d.track("q", hanging())]))
    .catch((e: unknown) => e);
  assert.ok(err instanceof DeadlineError);
  assert.equal(err.pending.length, 2);
});

test("/api/atlas/sync answers 503 within the limit instead of hanging", () => {
  const src = readFileSync(new URL("../app/api/atlas/sync/route.ts", import.meta.url), "utf8");
  assert.match(src, /createDeadline\(DB_DEADLINE_MS\)/);
  assert.match(src, /getAtlasSyncBundle\(userId, since, limit, deadline\.track\)/);
  assert.match(src, /deadline\.track\("locked", getLockedAtlasItemIds\(userId\)\)/);
  assert.match(src, /status: 503/);
  const db = readFileSync(new URL("../lib/atlas-db.ts", import.meta.url), "utf8");
  const bundle = db.slice(db.indexOf("export async function getAtlasSyncBundle("));
  for (const label of ["images", "items", "cards", "cardStates", "mastery", "now"]) {
    assert.ok(bundle.includes(`track("${label}", sql`), label);
  }
});
