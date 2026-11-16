#!/usr/bin/env node
// Check an explicitly enumerated Australian batch against its reviewed audio
// manifest. This script is read-only and never uploads or changes the catalog.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
const englishLocales = ["en-US", "en-GB", "en-AU"];

export async function auditAustralianAudio(expected, entries, root) {
  const problems = [];
  const required = new Map();
  const ids = new Set();
  for (const word of expected.words ?? []) {
    if (!word.id || ids.has(word.id) || !word.owner || !word.headword || !Array.isArray(word.examples) || word.examples.length !== 2) {
      problems.push(`invalid or duplicate expected word: ${word.id ?? "(missing)"}`);
      continue;
    }
    ids.add(word.id);
    for (const [kind, text] of [["headword", word.headword], ...word.examples.map((sentence, index) => [`example-${index}`, sentence])]) {
      for (const locale of englishLocales) {
        const key = `${word.owner}|${kind}|${locale}`;
        if (required.has(key) || typeof text !== "string" || !text.trim()) {
          problems.push(`invalid or duplicate expected audio: ${key}`);
        } else {
          required.set(key, text);
        }
      }
    }
  }
  if (ids.size === 0) problems.push("expected words must be a nonempty list");
  const actual = new Map();
  for (const entry of entries) {
    if (!englishLocales.includes(entry.locale)) continue;
    const key = `${entry.owner}|${entry.kind}|${entry.locale}`;
    if (!required.has(key)) continue;
    if (actual.has(key)) problems.push(`duplicate: ${key}`);
    actual.set(key, entry);
  }
  for (const [key, text] of required) {
    const item = actual.get(key);
    if (!item) { problems.push(`missing: ${key}`); continue; }
    if (item.text !== text) problems.push(`source text mismatch: ${key}`);
    if (typeof item.file !== "string" || path.basename(item.file) !== item.file) {
      problems.push(`invalid file path: ${key}`);
      continue;
    }
    const file = path.join(root, item.file);
    try {
      const bytes = await readFile(file);
      if (createHash("sha256").update(bytes).digest("hex") !== item.sha256) problems.push(`digest mismatch: ${key}`);
      const { stdout } = await exec("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "default=nw=1:nk=1", file]);
      if (stdout.trim() !== "mp3") problems.push(`not an MP3: ${key}`);
    } catch (error) {
      problems.push(`unreadable or invalid MP3: ${key}: ${error.message}`);
    }
  }
  return { ids: [...ids], requiredAudio: required.size, checkedAudio: actual.size, problems };
}

export async function auditPublishedAustralians(expected, entries, baseUrl, fetcher = fetch) {
  const problems = [];
  const url = new URL("/api/words", baseUrl);
  url.searchParams.set("lang", "zh-Hant");
  const fetchJSON = async (endpoint) => {
    const response = await fetcher(endpoint);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${endpoint}`);
    return response.json();
  };
  url.searchParams.set("learning", "zh-en");
  const australian = await fetchJSON(url);
  url.searchParams.set("learning", "zh-ja");
  const japanese = await fetchJSON(url);
  const checkAudio = async (word, kind, locale, audio) => {
    const recorded = entries.filter((entry) => entry.owner === word.owner && entry.kind === kind && entry.locale === locale);
    if (!audio) {
      problems.push(`missing published Australian ${kind} audio: ${word.id} ${locale}`);
    } else if (recorded.length !== 1) {
      problems.push(`missing or duplicate reference audio: ${word.id} ${kind}`);
    } else {
      let validUrl = false;
      try { validUrl = new URL(audio).protocol === "https:"; } catch { /* invalid URL */ }
      if (!validUrl) { problems.push(`invalid published audio URL: ${word.id} ${kind}`); return; }
      const response = await fetcher(audio);
      if (!response.ok) {
        problems.push(`unreachable published audio: ${word.id} ${kind}`);
      } else {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (createHash("sha256").update(bytes).digest("hex") !== recorded[0].sha256) {
          problems.push(`published audio differs from reference: ${word.id} ${kind}`);
        }
      }
    }
  };
  for (const word of expected.words) {
    const au = australian.words.find((entry) => entry.id === word.id);
    const ja = japanese.words.find((entry) => entry.id === word.id);
    if (!["shared", "au-only"].includes(word.scope)) {
      problems.push(`invalid scope: ${word.id}`);
      continue;
    }
    if (word.scope === "shared" && !ja) problems.push(`missing Japanese shared card: ${word.id}`);
    if (word.scope === "au-only" && ja) problems.push(`Australian-only card visible in Japan: ${word.id}`);
    if (ja?.audioUrls?.["en-AU"]) problems.push(`Australian audio leaked to Japan: ${word.id}`);
    if (!au) { problems.push(`missing Australian card: ${word.id}`); continue; }
    if (au.word !== word.headword) problems.push(`Australian headword mismatch: ${word.id}`);
    for (const locale of englishLocales) await checkAudio(word, "headword", locale, au.audioUrls?.[locale]);
    const detail = new URL(`/api/words/${encodeURIComponent(word.id)}`, baseUrl);
    detail.searchParams.set("lang", "zh-Hant");
    detail.searchParams.set("learning", "zh-en");
    const body = await fetchJSON(detail);
    if (body.word !== word.headword) problems.push(`detail headword mismatch: ${word.id}`);
    const sentences = (body.examples ?? []).map((example) => example.target ?? example.en);
    if (JSON.stringify(sentences) !== JSON.stringify(word.examples)) {
      problems.push(`detail examples mismatch: ${word.id}`);
    }
    for (let i = 0; i < word.examples.length; i++) {
      for (const locale of englishLocales) await checkAudio(word, `example-${i}`, locale, body.examples?.[i]?.audioUrls?.[locale]);
    }
  }
  return { problems, checkedIds: expected.words.map((word) => word.id) };
}

async function main() {
  const [expectedPath, manifestPath, baseUrl] = process.argv.slice(2);
  if (!expectedPath || !manifestPath || process.argv.length > 5) {
    throw new Error("usage: node scripts/audit-australian-audio.mjs <expected.json> <audio-manifest.json> [base-url]");
  }
  const expected = JSON.parse(await readFile(expectedPath, "utf8"));
  const entries = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(entries)) throw new Error("audio manifest must be an array");
  const result = await auditAustralianAudio(expected, entries, path.dirname(path.resolve(manifestPath)));
  const published = baseUrl && !result.problems.length
    ? await auditPublishedAustralians(expected, entries, baseUrl)
    : null;
  console.log(JSON.stringify({
    ...result,
    scope: "local candidate files",
    published,
    listeningReview: "not checked",
    exampleAudioDelivery: published ? "checked against reference digests" : "not checked",
    devicePlayback: "not checked",
  }, null, 2));
  if (result.problems.length || published?.problems.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
