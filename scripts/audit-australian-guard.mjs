#!/usr/bin/env node
// Read-only comparison of a deployed guard with the reviewed checkout, plus
// public list/detail/search probes. Authenticated study and lists need their
// own test account and are deliberately not claimed by this script.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function auditAustralianGuard({ baseUrl, expectedCommit, reservedIds, variants, images = {}, japaneseBaseline = {}, englishBaseline = {} }, fetcher = fetch) {
  const problems = [];
  if (!/^[a-f0-9]{40}$/i.test(expectedCommit ?? "")) throw new Error("expected commit must be a full 40-character Git SHA");
  if (!Array.isArray(reservedIds) || !reservedIds.length || new Set(reservedIds).size !== reservedIds.length ||
      reservedIds.some((id) => typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) {
    throw new Error("reserved IDs must be a nonempty unique list of valid IDs");
  }
  if (!variants || typeof variants !== "object" || Array.isArray(variants)) throw new Error("invalid reviewed variants");
  if (!japaneseBaseline || typeof japaneseBaseline !== "object" || Array.isArray(japaneseBaseline)) throw new Error("invalid Japanese baseline");
  if (!images || typeof images !== "object" || Array.isArray(images)) throw new Error("invalid reviewed image variants");
  if (!englishBaseline || typeof englishBaseline !== "object" || Array.isArray(englishBaseline)) throw new Error("invalid English baseline");
  const imageIds = Object.keys(images);
  for (const id of imageIds) {
    const baseline = japaneseBaseline[id];
    const en = englishBaseline[id];
    if (!en || typeof en.word !== "string" || !en.word.trim() || !en.audioUrls?.["en-US"]?.startsWith("https://") || !en.audioUrls?.["en-GB"]?.startsWith("https://") ||
        !Array.isArray(en.examples) || en.examples.length !== 2 || en.examples.some((e) => !e.en || !e.zh || !e.translations?.ja || !e.translations?.zh)) problems.push(`missing English baseline: ${id}`);
    if (!/^https:\/\//.test(images[id]) || reservedIds.includes(id) || variants[id] ||
        !baseline?.imageUrl?.startsWith("https://") || !baseline?.audioUrl?.startsWith("https://") ||
        typeof baseline?.word !== "string" || !baseline.word.trim() || !Array.isArray(baseline.examples) ||
        baseline.examples.length !== 2 || baseline.examples.some((sentence) => typeof sentence !== "string" || !sentence.trim())) problems.push(`invalid image or missing Japanese baseline: ${id}`);
  }
  const sharedIds = Object.keys(variants).filter((id) => variants[id]?.visibility === "shared");
  for (const id of sharedIds) {
    const baseline = japaneseBaseline[id];
    if (!baseline || typeof baseline.word !== "string" || !baseline.word.trim() ||
        typeof baseline.imageUrl !== "string" || !baseline.imageUrl.startsWith("https://") ||
        typeof baseline.audioUrl !== "string" || !baseline.audioUrl.startsWith("https://") ||
        !Array.isArray(baseline.examples) || baseline.examples.length !== 2 ||
        baseline.examples.some((sentence) => typeof sentence !== "string" || !sentence.trim())) {
      problems.push(`missing reviewed Japanese baseline: ${id}`);
    }
  }
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) {
    throw new Error("base URL must use HTTPS, except for localhost tests");
  }
  const request = (url) => fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const guardResponse = await request(new URL("/api/catalogue/region-guard", base));
  if (!guardResponse.ok) throw new Error(`guard endpoint HTTP ${guardResponse.status}`);
  const guard = await guardResponse.json();
  if (guard.guardProtocol !== "tuji-australia-catalogue-v2") problems.push("unexpected guard protocol");
  if (guard.deploymentCommitSource !== "vercel-environment-self-reported") problems.push("unexpected deployment commit source");
  if (guard.deploymentCommit !== expectedCommit.toLowerCase()) problems.push("deployment commit absent or different");
  if (guard.reservedIdCount !== reservedIds.length || guard.reservedIdsSha256 !== hash([...reservedIds].sort())) problems.push("reserved ID digest differs");
  if (guard.configurationSha256 !== hash([variants, reservedIds, images])) problems.push("regional configuration digest differs");
  if (!/\bno-store\b/i.test(guardResponse.headers.get("cache-control") ?? "")) {
    problems.push("guard response is not marked no-store for clients");
  }
  if (problems.length) return { problems, scopedIds: reservedIds.length, sharedVariantCount: sharedIds.length, directionsProbed: [], publicChecks: "not run: guard or Japanese baseline mismatch" };

  const directionsProbed = [];
  for (const direction of ["zh-ja", "zh-en"]) {
    const url = new URL("/api/words", base);
    url.searchParams.set("lang", "zh-Hant");
    url.searchParams.set("learning", direction);
    const response = await request(url);
    if (!response.ok) { problems.push(`${direction} list HTTP ${response.status}`); continue; }
    const body = await response.json();
    if (!Array.isArray(body.words)) { problems.push(`${direction} list is not an array`); continue; }
    for (const id of reservedIds) {
      const visible = direction === "zh-en" && variants[id]?.visibility === "australia-only";
      const matches = body.words.filter((word) => word.id === id);
      if (matches.length !== (visible ? 1 : 0)) problems.push(`${direction} list visibility mismatch: ${id}`);
    }
    for (const id of imageIds) {
      const expected = direction === "zh-en" ? images[id] : japaneseBaseline[id].imageUrl;
      const matches = body.words.filter((word) => word.id === id);
      if (matches.length !== 1 || matches[0].imageUrl !== expected) problems.push(`${direction} image-only list mismatch: ${id}`);
      const detail = new URL(`/api/words/${encodeURIComponent(id)}`, base);
      detail.searchParams.set("lang", "zh-Hant"); detail.searchParams.set("learning", direction);
      const response = await request(detail);
      if (!response.ok) { problems.push(`${direction} image-only detail HTTP ${response.status}: ${id}`); continue; }
      const word = await response.json();
      if (word.imageUrl !== expected) problems.push(`${direction} image-only detail mismatch: ${id}`);
      const baseline = japaneseBaseline[id];
      const en = englishBaseline[id];
      if (direction === "zh-en") {
        const projectedExamples = (word.examples ?? []).map((e) => ({ en: e.en, zh: e.zh, translations: e.translations,
          audioUrls: Object.fromEntries(["en-US", "en-GB"].filter((locale) => e.audioUrls?.[locale]).map((locale) => [locale, e.audioUrls[locale]])) }));
        const expectedExamples = en.examples.map((e) => ({ ...e,
          audioUrls: Object.fromEntries(["en-US", "en-GB"].filter((locale) => e.audioUrls?.[locale]).map((locale) => [locale, e.audioUrls[locale]])) }));
        if (word.word !== en.word || ["en-US", "en-GB", "ja-JP"].some((locale) => word.audioUrls?.[locale] !== en.audioUrls?.[locale]) ||
            JSON.stringify(projectedExamples) !== JSON.stringify(expectedExamples)) problems.push(`${direction} image-only baseline mismatch: ${id}`);
      }
      if (direction === "zh-ja" && (word.word !== baseline.word || word.audioUrls?.["ja-JP"] !== baseline.audioUrl ||
          word.audioUrls?.["en-AU"] || JSON.stringify((word.examples ?? []).map((x) => x.target ?? x.en)) !== JSON.stringify(baseline.examples))) {
        problems.push(`${direction} image-only baseline mismatch: ${id}`);
      }
    }
    for (const id of sharedIds) {
      const variant = variants[id];
      const baseline = japaneseBaseline[id];
      const matches = body.words.filter((word) => word.id === id);
      const expectedWord = direction === "zh-en" ? variant.headword : baseline.word;
      const expectedImage = direction === "zh-en" ? variant.imageUrl : baseline.imageUrl;
      if (matches.length !== 1 || matches[0].word !== expectedWord || matches[0].imageUrl !== expectedImage) {
        problems.push(`${direction} shared list mismatch: ${id}`);
        continue;
      }
      const audio = matches[0].audioUrls ?? {};
      if (direction === "zh-en") {
        for (const locale of ["en-US", "en-GB", "en-AU"]) if (audio[locale] !== variant.audioUrls?.[locale] || !audio[locale]) problems.push(`${direction} shared list audio mismatch: ${id} ${locale}`);
      } else if (audio["ja-JP"] !== baseline.audioUrl || audio["en-AU"]) problems.push(`${direction} shared list audio mismatch: ${id}`);
    }
    for (let i = 0; i < reservedIds.length; i += 5) {
      await Promise.all(reservedIds.slice(i, i + 5).map(async (id) => {
        const visible = direction === "zh-en" && variants[id]?.visibility === "australia-only";
        const detail = new URL(`/api/words/${encodeURIComponent(id)}`, base);
        detail.searchParams.set("lang", "zh-Hant"); detail.searchParams.set("learning", direction);
        const detailResponse = await request(detail);
        if (detailResponse.status !== (visible ? 200 : 404)) problems.push(`${direction} detail visibility mismatch: ${id} (${detailResponse.status})`);
        if (visible && detailResponse.ok && (await detailResponse.json()).word !== variants[id].headword) problems.push(`${direction} detail headword mismatch: ${id}`);
        const search = new URL("/api/search", base);
        search.searchParams.set("lang", "zh-Hant"); search.searchParams.set("learning", direction);
        search.searchParams.set("q", variants[id]?.headword ?? id.replaceAll("-", " "));
        search.searchParams.set("limit", "200");
        const searchResponse = await request(search);
        if (!searchResponse.ok) { problems.push(`${direction} search HTTP ${searchResponse.status}: ${id}`); return; }
        const results = (await searchResponse.json()).results;
        if (!Array.isArray(results) || results.some((word) => word.id === id) !== visible) problems.push(`${direction} search visibility mismatch: ${id}`);
      }));
    }
    for (const id of sharedIds) {
      const variant = variants[id];
      const baseline = japaneseBaseline[id];
      const detail = new URL(`/api/words/${encodeURIComponent(id)}`, base);
      detail.searchParams.set("lang", "zh-Hant"); detail.searchParams.set("learning", direction);
      const detailResponse = await request(detail);
      if (!detailResponse.ok) { problems.push(`${direction} shared detail HTTP ${detailResponse.status}: ${id}`); continue; }
      const word = await detailResponse.json();
      const expectedWord = direction === "zh-en" ? variant.headword : baseline.word;
      const expectedImage = direction === "zh-en" ? variant.imageUrl : baseline.imageUrl;
      const expectedExamples = direction === "zh-en" ? variant.examples?.map((example) => example.en) : baseline.examples;
      if (word.word !== expectedWord || word.imageUrl !== expectedImage ||
          JSON.stringify((word.examples ?? []).map((example) => example.target ?? example.en)) !== JSON.stringify(expectedExamples)) {
        problems.push(`${direction} shared detail content mismatch: ${id}`);
      }
      if (direction === "zh-en") {
        for (const locale of ["en-US", "en-GB", "en-AU"]) {
          if (!variant.audioUrls?.[locale] || word.audioUrls?.[locale] !== variant.audioUrls[locale]) problems.push(`${direction} shared detail audio mismatch: ${id} ${locale}`);
          for (let i = 0; i < 2; i++) if (!variant.examples?.[i]?.audioUrls?.[locale] || word.examples?.[i]?.audioUrls?.[locale] !== variant.examples[i].audioUrls[locale]) problems.push(`${direction} shared example audio mismatch: ${id} ${i} ${locale}`);
        }
      } else if (word.audioUrls?.["ja-JP"] !== baseline.audioUrl || word.audioUrls?.["en-AU"] || (word.examples ?? []).some((example) => example.audioUrls?.["en-AU"])) {
        problems.push(`${direction} shared detail audio mismatch: ${id}`);
      }
      const search = new URL("/api/search", base);
      search.searchParams.set("lang", "zh-Hant"); search.searchParams.set("learning", direction);
      search.searchParams.set("q", expectedWord); search.searchParams.set("limit", "200");
      const searchResponse = await request(search);
      if (!searchResponse.ok) { problems.push(`${direction} shared search HTTP ${searchResponse.status}: ${id}`); continue; }
      const results = (await searchResponse.json()).results;
      if (!Array.isArray(results) || !results.some((entry) => entry.id === id)) problems.push(`${direction} shared search missing: ${id}`);
    }
    directionsProbed.push(direction);
  }
  return { problems, scopedIds: reservedIds.length, sharedVariantCount: sharedIds.length, directionsProbed, deploymentEvidence: "Vercel environment self-report, not a cryptographic attestation", publicChecks: "list, detail and sampled search; Japanese example playback, authenticated paths and fleet convergence not checked" };
}

async function main() {
  const [baseUrl, expectedCommit, root = process.cwd(), baselinePath, englishBaselinePath] = process.argv.slice(2);
  if (!baseUrl || !expectedCommit || process.argv.length > 7) throw new Error("usage: node scripts/audit-australian-guard.mjs <base-url> <expected-commit> [project-root] [reviewed-japanese-baseline.json] [reviewed-english-baseline.json]");
  const reservedIds = JSON.parse(await readFile(path.join(root, "data/australian-only-word-ids.json"), "utf8"));
  const variants = JSON.parse(await readFile(path.join(root, "data/australian-word-variants.json"), "utf8"));
  const images = JSON.parse(await readFile(path.join(root, "data/australian-image-variants.json"), "utf8"));
  const japaneseBaseline = baselinePath ? JSON.parse(await readFile(baselinePath, "utf8")) : {};
  const englishBaseline = englishBaselinePath ? JSON.parse(await readFile(englishBaselinePath, "utf8")) : {};
  const result = await auditAustralianGuard({ baseUrl, expectedCommit, reservedIds, variants, images, japaneseBaseline, englishBaseline });
  console.log(JSON.stringify(result, null, 2));
  if (result.problems.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
