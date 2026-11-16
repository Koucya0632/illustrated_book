import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditAustralianAudio } from "../scripts/audit-australian-audio.mjs";

test("Australian batch audit reports missing clips, wrong text and invalid files", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tuji-au-audit-"));
  try {
    await writeFile(path.join(dir, "not-audio.mp3"), "not an mp3");
    const result = await auditAustralianAudio({
      words: [{
        id: "transit-ic-card",
        owner: "transit-ic-card-au",
        headword: "Opal card",
        examples: ["Tap your Opal card here.", "I topped up my Opal card."],
      }],
    }, [{
      owner: "transit-ic-card-au",
      kind: "headword",
      locale: "en-AU",
      text: "transit IC card",
      file: "not-audio.mp3",
      sha256: "incorrect",
    }], dir);
    assert.equal(result.requiredAudio, 9);
    assert(result.problems.some((issue: string) => issue.includes("source text mismatch")));
    assert(result.problems.some((issue: string) => issue.includes("digest mismatch")));
    assert(result.problems.some((issue: string) => issue.includes("unreadable or invalid MP3")));
    assert.equal(result.problems.filter((issue: string) => issue.startsWith("missing:")).length, 8);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("published audit verifies both example audio files against their exact reference", async () => {
  const { auditPublishedAustralians } = await import("../scripts/audit-australian-audio.mjs");
  const expected = { words: [{ id: "rental-bond", owner: "rental-bond", scope: "au-only", headword: "rental bond", examples: ["First.", "Second."] }] };
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const entries = ["headword", "example-0", "example-1"].flatMap((kind) => ["en-US", "en-GB", "en-AU"].map((locale) => ({ owner: "rental-bond", locale, kind, sha256: hash(`${kind}-${locale}`) })));
  const audio = (kind: string) => Object.fromEntries(["en-US", "en-GB", "en-AU"].map((locale) => [locale, `https://media.example/${kind}-${locale}`]));
  const fetcher: typeof fetch = async (value) => {
    const url = new URL(value instanceof Request ? value.url : value);
    if (url.pathname === "/api/words" && url.searchParams.get("learning") === "zh-ja") return Response.json({ words: [] });
    if (url.pathname === "/api/words") return Response.json({ words: [{ id: "rental-bond", word: "rental bond", audioUrls: audio("headword") }] });
    if (url.pathname === "/api/words/rental-bond") return Response.json({ word: "rental bond", examples: [
      { target: "First.", audioUrls: audio("example-0") },
      { target: "Second.", audioUrls: audio("example-1") },
    ] });
    return new Response(url.pathname.slice(1));
  };
  const result = await auditPublishedAustralians(expected, entries, "https://example.test", fetcher);
  assert.deepEqual(result.problems, []);
  entries[3].sha256 = entries[6].sha256;
  const swapped = await auditPublishedAustralians(expected, entries, "https://example.test", fetcher);
  assert(swapped.problems.some((issue: string) => issue.includes("example-0")));
});

test("published audit detects Japanese leakage, stale words and wrong audio", async () => {
  const { auditPublishedAustralians } = await import("../scripts/audit-australian-audio.mjs");
  const expected = {
    words: [{
      id: "rental-bond",
      owner: "rental-bond",
      scope: "au-only",
      headword: "rental bond",
      examples: ["I paid the rental bond.", "I checked the bond."],
    }],
  };
  const entries = [{ owner: "rental-bond", kind: "headword", locale: "en-AU", sha256: "wrong" }];
  const fetcher: typeof fetch = async (value) => {
    const url = new URL(value instanceof Request ? value.url : value);
    if (url.pathname === "/api/words" && url.searchParams.get("learning") === "zh-ja") {
      return Response.json({ words: [{ id: "rental-bond", audioUrls: { "en-AU": "leak" } }] });
    }
    if (url.pathname === "/api/words") {
      return Response.json({ words: [{ id: "rental-bond", word: "old word", audioUrls: { "en-AU": "https://media.example/clip" } }] });
    }
    if (url.pathname === "/api/words/rental-bond") {
      return Response.json({ word: "old word", examples: [{ target: "old sentence" }] });
    }
    return new Response("different bytes");
  };
  const result = await auditPublishedAustralians(expected, entries, "https://example.test", fetcher);
  assert(result.problems.some((issue: string) => issue.includes("visible in Japan")));
  assert(result.problems.some((issue: string) => issue.includes("audio leaked to Japan")));
  assert(result.problems.some((issue: string) => issue.includes("headword mismatch")));
  assert(result.problems.some((issue: string) => issue.includes("audio differs")));
  assert(result.problems.some((issue: string) => issue.includes("examples mismatch")));
  assert(result.problems.some((issue: string) => issue.includes("example-0 audio")));
  assert(result.problems.some((issue: string) => issue.includes("example-1 audio")));
});
