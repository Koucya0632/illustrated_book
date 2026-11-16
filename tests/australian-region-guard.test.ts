import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import reservedIds from "../data/australian-only-word-ids.json";
import { GET } from "../app/api/catalogue/region-guard/route";
import { auditAustralianGuard } from "../scripts/audit-australian-guard.mjs";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const commit = "a".repeat(40);

test("public guard exposes only hashes and a valid platform commit, with no-store", async () => {
  const original = process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    process.env.VERCEL_GIT_COMMIT_SHA = commit;
    const response = await GET();
    const body = await response.json();
    assert.equal(body.deploymentCommit, commit);
    assert.equal(body.deploymentCommitSource, "vercel-environment-self-reported");
    assert.equal(body.reservedIdsSha256, digest([...reservedIds].sort()));
    assert.equal(body.reservedIdCount, reservedIds.length);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
    assert(!JSON.stringify(body).includes(reservedIds[0]));
    process.env.VERCEL_GIT_COMMIT_SHA = "invalid";
    assert.equal((await (await GET()).json()).deploymentCommit, null);
  } finally {
    if (original === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = original;
  }
});

test("deployed guard probe rejects wrong commits and detects leaked reserved IDs", async () => {
  const ids = ["rental-bond"];
  const variants = {};
  let leak = false;
  const fetcher: typeof fetch = async (value) => {
    const url = new URL(value instanceof Request ? value.url : value);
    if (url.pathname === "/api/catalogue/region-guard") {
      return Response.json({ guardProtocol: "tuji-australia-catalogue-v1", deploymentCommit: commit, deploymentCommitSource: "vercel-environment-self-reported",
        reservedIdCount: 1, reservedIdsSha256: digest(ids), configurationSha256: digest([variants, ids]),
      }, { headers: { "cache-control": "no-store", "vercel-cdn-cache-control": "no-store" } });
    }
    if (url.pathname === "/api/words") return Response.json({ words: leak ? [{ id: ids[0] }] : [] });
    if (url.pathname === "/api/words/rental-bond") return new Response(null, { status: 404 });
    if (url.pathname === "/api/search") return Response.json({ results: [] });
    throw new Error(`unexpected request ${url}`);
  };
  const input = { baseUrl: "https://example.test", expectedCommit: commit, reservedIds: ids, variants };
  assert.deepEqual((await auditAustralianGuard(input, fetcher)).problems, []);
  assert.match((await auditAustralianGuard({ ...input, expectedCommit: "b".repeat(40) }, fetcher)).problems[0], /deployment commit/);
  leak = true;
  assert((await auditAustralianGuard(input, fetcher)).problems.some((issue: string) => issue.includes("list visibility mismatch")));
});

test("shared variants require and compare the reviewed Japanese baseline and both audio projections", async () => {
  const ids = ["rental-bond"];
  const audio = { "en-US": "https://media.test/us", "en-GB": "https://media.test/gb", "en-AU": "https://media.test/au" };
  const variant = { visibility: "shared", headword: "Opal card", imageUrl: "https://media.test/au.webp", audioUrls: audio,
    examples: [{ en: "Tap the card.", audioUrls: audio }, { en: "Top up the card.", audioUrls: audio }] };
  const variants = { "transit-ic-card": variant };
  const baseline = { word: "交通系ICカード", imageUrl: "https://media.test/ja.webp", audioUrl: "https://media.test/ja.mp3", examples: ["カードを使います。", "カードに入金します。"] };
  let missingShared = false;
  let wrongAuAudio = false;
  const fetcher: typeof fetch = async (value) => {
    const url = new URL(value instanceof Request ? value.url : value);
    const ja = url.searchParams.get("learning") === "zh-ja";
    if (url.pathname === "/api/catalogue/region-guard") return Response.json({ guardProtocol: "tuji-australia-catalogue-v1", deploymentCommit: commit, deploymentCommitSource: "vercel-environment-self-reported", reservedIdCount: 1, reservedIdsSha256: digest(ids), configurationSha256: digest([variants, ids]) }, { headers: { "cache-control": "no-store", "vercel-cdn-cache-control": "no-store" } });
    const word = ja ? { id: "transit-ic-card", word: baseline.word, imageUrl: baseline.imageUrl, audioUrls: { "ja-JP": baseline.audioUrl }, examples: baseline.examples.map((target) => ({ target })) }
      : { id: "transit-ic-card", word: variant.headword, imageUrl: variant.imageUrl, audioUrls: wrongAuAudio ? { ...audio, "en-AU": "https://media.test/stale" } : audio, examples: variant.examples.map((example) => ({ ...example, target: example.en })) };
    if (url.pathname === "/api/words") return Response.json({ words: missingShared ? [] : [word] });
    if (url.pathname === "/api/words/rental-bond") return new Response(null, { status: 404 });
    if (url.pathname === "/api/words/transit-ic-card") return missingShared ? new Response(null, { status: 404 }) : Response.json(word);
    if (url.pathname === "/api/search") return Response.json({ results: url.searchParams.get("q") === word.word && !missingShared ? [word] : [] });
    throw new Error(`unexpected request ${url}`);
  };
  const input = { baseUrl: "https://example.test", expectedCommit: commit, reservedIds: ids, variants, japaneseBaseline: { "transit-ic-card": baseline } };
  assert.deepEqual((await auditAustralianGuard(input, fetcher)).problems, []);
  assert((await auditAustralianGuard({ ...input, japaneseBaseline: {} }, fetcher)).problems.some((issue: string) => issue.includes("baseline")));
  missingShared = true;
  assert((await auditAustralianGuard(input, fetcher)).problems.some((issue: string) => issue.includes("shared list mismatch")));
  missingShared = false;
  wrongAuAudio = true;
  assert((await auditAustralianGuard(input, fetcher)).problems.some((issue: string) => issue.includes("shared list audio mismatch")));
});
