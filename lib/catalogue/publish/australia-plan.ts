/** Read-only preparation for the mixed Australia atlas batch.
 *
 * This is deliberately NOT an apply implementation. The existing publisher is
 * for a single new topic and must never be tricked into publishing a regional
 * batch. A later writer must first prove the deployed region guard and every
 * review gate, and must use the shared publisher's create-only storage and
 * journal semantics. No function in this module mutates database or storage.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { digest } from "./plan";
import { AUSTRALIAN_CATEGORY_ASSIGNMENTS, AUSTRALIAN_HOUSING_CATEGORY } from "./australia-categories";

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
// Candidate files are an independently reviewed, versioned external data format.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const parse = (file: string): Json => JSON.parse(fs.readFileSync(file, "utf8"));
const safeId = (id: unknown): id is string => typeof id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);

export type AustralianArtifact = {
  role: string; owner: string; locale?: string; sourceText?: string;
  localFile: string; bytes: number; sha256: string; bucket: "word-images" | "word-audio";
  proposedStoragePath: string; mimeType: "image/webp" | "audio/mpeg";
};

/** Build a digest-pinned local plan. Nothing in the source's `status` can
 * assert readiness: semantic, pronunciation, hearing, deployed-guard and
 * physical target verification remain explicit blocking gates. */
export function prepareAustralianPlan(sourceDirectory: string, reservedIdsFile: string, codeRoot: string, options: { listeningWaivedByUser?: boolean } = {}) {
  const source = fs.realpathSync(sourceDirectory);
  const parent = path.dirname(source);
  const read = (file: string) => fs.readFileSync(file);
  const hashFile = (file: string) => sha256(read(file));
  const sourceFiles = {
    reviewPackage: path.join(source, "review-package.json"),
    existingAudioManifest: path.join(source, "existing-card-au-audio/manifest.json"),
    existingSnapshots: path.join(source, "existing-card-detail-public-snapshots.json"),
    japanTransitGuardBaseline: path.join(source, "japan-transit-guard-baseline.json"),
    japanTransitApiSnapshot: path.join(source, "japan-transit-api-baseline.raw.json"),
    japanTransitDatabaseSnapshot: path.join(source, "japan-transit-db-baseline.json"),
    japanTransitMediaEvidence: path.join(source, "japan-transit-media-evidence.json"),
    reservedIds: fs.realpathSync(reservedIdsFile),
    planner: fs.realpathSync(path.join(codeRoot, "lib/catalogue/publish/australia-plan.ts")),
    plannerCli: fs.realpathSync(path.join(codeRoot, "scripts/prepare-australian-plan.ts")),
    previewCode: fs.realpathSync(path.join(codeRoot, "lib/catalogue/publish/australia-variant-preview.ts")),
    publicObjects: fs.realpathSync(path.join(codeRoot, "lib/storage/public-objects.ts")),
    publicWriter: fs.realpathSync(path.join(codeRoot, "lib/storage/public-writer.ts")),
    r2Rest: fs.realpathSync(path.join(codeRoot, "lib/storage/r2-rest.ts")),
    gates: fs.realpathSync(path.join(codeRoot, "lib/catalogue/publish/australia-gates.ts")),
    journal: fs.realpathSync(path.join(codeRoot, "lib/catalogue/publish/australia-journal.ts")),
    categories: fs.realpathSync(path.join(codeRoot, "lib/catalogue/publish/australia-categories.ts")),
    databaseAdapter: fs.realpathSync(path.join(codeRoot, "lib/catalogue/publish/australia-database-test-adapter.ts")),
    testOwnership: fs.realpathSync(path.join(codeRoot, "lib/catalogue/publish/australia-ownership-test.ts")),
    testSessionLock: fs.realpathSync(path.join(codeRoot, "lib/catalogue/publish/australia-session-lock.ts")),
    commonDatabase: fs.realpathSync(path.join(codeRoot, "lib/catalogue/publish/database.ts")),
    imageVariantConfig: fs.realpathSync(path.join(codeRoot, "data/australian-image-variants.json")),
    regionVariantCode: fs.realpathSync(path.join(codeRoot, "lib/australian-word-variants.ts")),
    guardCode: fs.realpathSync(path.join(codeRoot, "scripts/audit-australian-guard.mjs")),
    guardRoute: fs.realpathSync(path.join(codeRoot, "app/api/catalogue/region-guard/route.ts")),
    commonStorage: fs.realpathSync(path.join(codeRoot, "lib/catalogue/publish/storage.ts")),
    commonPlan: fs.realpathSync(path.join(codeRoot, "lib/catalogue/publish/plan.ts")),
  };
  const sourcePins = Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, { file, sha256: hashFile(file) }]));
  const japanBaseline = parse(sourceFiles.japanTransitGuardBaseline)?.["transit-ic-card"];
  const japanApi = parse(sourceFiles.japanTransitApiSnapshot);
  const japanDb = parse(sourceFiles.japanTransitDatabaseSnapshot)?.data;
  const japanMedia = parse(sourceFiles.japanTransitMediaEvidence);
  assert(japanBaseline && japanBaseline.word === japanApi.word && japanBaseline.imageUrl === japanApi.imageUrl && japanBaseline.audioUrl === japanApi.audioUrls?.["ja-JP"] && JSON.stringify(japanBaseline.examples) === JSON.stringify(japanApi.examples?.map((e: Json) => e.target)), "Japan transit API baseline drifted");
  assert(japanDb?.terms?.length === 1 && japanDb.terms[0].term === japanBaseline.word && japanDb.terms[0].audio_url === japanBaseline.audioUrl && japanDb?.examples?.length === 2 && JSON.stringify(japanDb.examples.map((e: Json) => e.japanese)) === JSON.stringify(japanBaseline.examples), "Japan transit database baseline drifted");
  assert(japanMedia.apiSnapshotSha256 === sourcePins.japanTransitApiSnapshot.sha256 && japanMedia.databaseSnapshotSha256 === sourcePins.japanTransitDatabaseSnapshot.sha256 && japanMedia.guardBaselineSha256 === sourcePins.japanTransitGuardBaseline.sha256 && japanMedia.items?.length === 4, "Japan transit media evidence drifted");
  const japanMediaExpected: Record<string, string> = { image: japanBaseline.imageUrl, "headword.ja-JP": japanBaseline.audioUrl,
    "example-0.ja-JP": japanDb.examples[0].japanese_audio_url, "example-1.ja-JP": japanDb.examples[1].japanese_audio_url };
  for (const [kind,url] of Object.entries(japanMediaExpected)) {
    const rows=japanMedia.items.filter((row: Json)=>row.kind===kind);
    assert(rows.length===1 && rows[0].url===url && rows[0].httpStatus===200 && rows[0].contentType===(kind==="image"?"image/webp":"audio/mpeg") && /^[a-f0-9]{64}$/.test(rows[0].sha256) && Number.isInteger(rows[0].bytes) && rows[0].bytes>256, `Japan transit media evidence invalid: ${kind}`);
  }
  const pkg = parse(sourceFiles.reviewPackage);
  assert(pkg.sources && typeof pkg.sources === "object" && !Array.isArray(pkg.sources), "review package has no source pins");
  for (const [relative, hash] of Object.entries(pkg.sources)) {
    assert(!path.isAbsolute(relative), `invalid source path ${relative}`);
    const full = fs.realpathSync(path.resolve(source, relative));
    assert(full.startsWith(`${source}${path.sep}`) && typeof hash === "string" && hashFile(full) === hash, `review package source changed: ${relative}`);
  }
  const candidateSource: Json[] = parse(path.join(source, "candidates.json"));
  const spanSource: Json[] = parse(path.join(source, "all-spans-draft.json"));
  const imageSource: Json[] = parse(path.join(source, "webp/manifest.json"));
  const audioSource: Json[] = parse(path.join(source, "audio/manifest.json"));
  const reserved: unknown = parse(sourceFiles.reservedIds);
  const entries: Json[] = pkg.wordEntries;
  assert(Array.isArray(entries) && entries.length > 0, "empty candidate batch");
  const ids = entries.map((e) => e.id);
  assert(ids.every(safeId) && new Set(ids).size === ids.length, "invalid or duplicate candidate IDs");
  assert(ids.every((id) => AUSTRALIAN_CATEGORY_ASSIGNMENTS[id]) && Object.keys(AUSTRALIAN_CATEGORY_ASSIGNMENTS).length === ids.length, "candidate category assignments incomplete");
  assert(Array.isArray(reserved) && reserved.every(safeId) && new Set(reserved).size === reserved.length, "invalid guard ID list");
  const reservedSet = new Set(reserved);
  assert(ids.every((id) => reservedSet.has(id)), "candidate ID missing from the reserved regional guard");
  const artifactKeys = new Set<string>();
  const artifacts: AustralianArtifact[] = [];
  const asset = (meta: Json, base: string, role: string, owner: string, locale?: string, sourceText?: string) => {
    assert(safeId(owner), `invalid artifact owner ${owner}`);
    assert(typeof meta.sha256 === "string" && /^[a-f0-9]{64}$/.test(meta.sha256), `${owner}: invalid SHA-256`);
    const requested = meta.candidate ?? meta.file;
    assert(typeof requested === "string" && !path.isAbsolute(requested), `${owner}: invalid local file path`);
    const resolved = fs.realpathSync(path.resolve(base, requested));
    const permitted = fs.realpathSync(base);
    assert(resolved.startsWith(`${permitted}${path.sep}`), `${owner}: artifact escapes its allowed source directory`);
    const bytes = read(resolved);
    assert(bytes.length === meta.bytes && sha256(bytes) === meta.sha256, `${owner}: artifact bytes differ from manifest`);
    const image = role === "image";
    if (image) assert(bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP", `${owner}: invalid WebP header`);
    else assert(bytes.length > 256 && (bytes.subarray(0, 3).toString() === "ID3" || bytes.subarray(0, 4096).some((v, i, b) => v === 0xff && i + 1 < b.length && (b[i + 1] & 0xe0) === 0xe0)), `${owner}: invalid MP3 header`);
    if (!image) assert(typeof locale === "string" && ["en-US", "en-GB", "en-AU", "ja-JP"].includes(locale) && typeof sourceText === "string" && sourceText.length > 0, `${owner}: invalid audio source`);
    const bucket = image ? "word-images" : "word-audio";
    const proposedStoragePath = image ? `australia/words/${owner}/${meta.sha256}.webp` : `australia/audio/${owner}/${locale}/${meta.sha256}.mp3`;
    const key = `${bucket}/${proposedStoragePath}`;
    assert(!artifactKeys.has(key), `${owner}: duplicate object path`); artifactKeys.add(key);
    artifacts.push({ role, owner, ...(locale ? { locale } : {}), ...(sourceText ? { sourceText } : {}), localFile: resolved, bytes: bytes.length, sha256: meta.sha256, bucket, proposedStoragePath, mimeType: image ? "image/webp" : "audio/mpeg" });
  };
  const validateSpans = (row: Json, expected: string) => {
    assert(row.sentence === expected && Array.isArray(row.spans) && row.spans.map((s: Json) => s.text).join("") === expected, `${row.id}: sentence spans drifted`);
    const tappable = row.spans.filter((s: Json) => s.gloss);
    assert(tappable.length >= 2 && tappable.length <= 8, `${row.id}: invalid tappable span count`);
    for (const part of tappable) {
      assert(["zh-Hant", "ja", "en"].every((lang) => typeof part.gloss[lang] === "string" && part.gloss[lang].trim()), `${row.id}: missing contextual gloss`);
      if (row.language === "ja") assert(typeof part.reading === "string" && part.reading.trim(), `${row.id}: missing Japanese reading`);
    }
  };
  for (const entry of entries) {
    const w = entry.candidate;
    const original = candidateSource.filter((x) => x.id === entry.id);
    assert(original.length === 1 && JSON.stringify(original[0]) === JSON.stringify(w), `${entry.id}: package differs from candidate source`);
    for (const row of entry.spans ?? []) {
      const matches = spanSource.filter((x) => x.id === entry.id && x.order === row.order && x.language === row.language);
      assert(matches.length === 1 && JSON.stringify(matches[0]) === JSON.stringify(row), `${entry.id}: package differs from span source`);
    }
    const originalImage = imageSource.filter((x) => x.id === entry.id);
    assert(originalImage.length === 1 && originalImage[0].sha256 === entry.image?.sha256 && originalImage[0].candidate === entry.image?.candidate, `${entry.id}: package differs from image source`);
    for (const clip of entry.audio ?? []) {
      const matches = audioSource.filter((x) => x.owner === entry.id && x.kind === clip.kind && x.locale === clip.locale);
      assert(matches.length === 1 && matches[0].sha256 === clip.sha256 && matches[0].file === clip.file && matches[0].text === clip.text, `${entry.id}: package differs from audio source`);
    }
    assert(w?.id === entry.id && w.visibility === "australia-only" && w.pronunciation && w.partOfSpeech && w.ja && w.reading && Array.isArray(w.readingSegments), `${entry.id}: incomplete word`);
    assert(w.readingSegments.map((x: Json) => x.text).join("") === w.ja && w.readingSegments.map((x: Json) => x.ruby ?? x.text).join("") === w.reading, `${entry.id}: reading segment drift`);
    assert(Array.isArray(w.examples) && w.examples.length === 2 && w.examples[0].level === "A2" && w.examples[1].level === "B1", `${entry.id}: example contract`);
    assert(Array.isArray(entry.spans) && entry.spans.length === 4, `${entry.id}: missing example spans`);
    for (const lang of ["en", "ja"]) for (const slot of [0, 1]) {
      const rows = entry.spans.filter((r: Json) => r.language === lang && r.order === slot);
      assert(rows.length === 1, `${entry.id}:${slot}:${lang}: missing or duplicated span`); validateSpans(rows[0], w.examples[slot][lang]);
    }
    asset(entry.image, source, "image", entry.id);
    assert(Array.isArray(entry.audio) && entry.audio.length === 12, `${entry.id}: expected 12 audio clips`);
    for (const kind of ["headword", "example-0", "example-1"]) for (const locale of ["en-US", "en-GB", "en-AU", "ja-JP"]) {
      const matches = entry.audio.filter((a: Json) => a.kind === kind && a.locale === locale && a.owner === entry.id);
      assert(matches.length === 1, `${entry.id}:${kind}:${locale}: missing or duplicate audio`);
      const expected = kind === "headword" ? (locale === "ja-JP" ? w.ja : w.word) : w.examples[Number(kind.slice(-1))][locale === "ja-JP" ? "ja" : "en"];
      assert(matches[0].text === expected, `${entry.id}:${kind}:${locale}: stale spoken text`);
      asset(matches[0], path.join(source, "audio"), kind, entry.id, locale, expected);
    }
  }
  assert(Array.isArray(pkg.existingRegionalImageCandidates), "missing existing card images");
  for (const img of pkg.existingRegionalImageCandidates) asset(img, source, "image", img.id);
  const opal = pkg.opalRegionalCandidate;
  assert(JSON.stringify(opal?.candidate) === JSON.stringify(parse(path.join(source, "opal-candidate.json"))), "Opal candidate source changed");
  assert(opal?.candidate?.id === "transit-ic-card" && opal.candidate.visibility === "shared" && opal.candidate.word === "Opal card", "invalid Opal regional candidate");
  assert(Array.isArray(opal.spans) && opal.spans.length === 4 && Array.isArray(opal.audio) && opal.audio.length === 12, "incomplete Opal variant");
  for (const lang of ["en", "ja"]) for (const slot of [0, 1]) {
    const rows = opal.spans.filter((r: Json) => r.language === lang && r.order === slot);
    assert(rows.length === 1, `Opal:${slot}:${lang}: missing or duplicated span`);
    validateSpans(rows[0], opal.candidate.examples[slot][lang]);
  }
  for (const kind of ["headword", "example-0", "example-1"]) for (const locale of ["en-US", "en-GB", "en-AU", "ja-JP"]) {
    assert(opal.audio.filter((a: Json) => a.kind === kind && a.locale === locale && a.owner === "transit-ic-card-au").length === 1, `Opal:${kind}:${locale}: missing or duplicated clip`);
  }
  const calibrationAudio = fs.realpathSync(path.join(parent, "australia-atlas-calibration/audio"));
  assert(hashFile(path.join(calibrationAudio, "manifest.json")) === opal.audioManifestSHA256, "Opal audio source manifest changed");
  assert(hashFile(path.join(parent, "australia-atlas-calibration/example-spans-draft.json")) === opal.spanSourceSHA256, "Opal span source changed");
  for (const clip of opal.audio) {
    const expected = clip.kind === "headword" ? (clip.locale === "ja-JP" ? opal.candidate.ja : opal.candidate.word) : opal.candidate.examples[Number(clip.kind.slice(-1))][clip.locale === "ja-JP" ? "ja" : "en"];
    assert(clip.text === expected, `Opal ${clip.kind}:${clip.locale}: stale text`);
    asset(clip, calibrationAudio, clip.kind, "transit-ic-card", clip.locale, expected);
  }
  const existing: Json[] = parse(sourceFiles.existingAudioManifest);
  const snapshots = parse(sourceFiles.existingSnapshots);
  const expectedExisting = ["route-map", "station-platform", "bus-stop", "student-id-card", "menu", "card-reader", "receipt"];
  assert(Array.isArray(existing) && existing.length === expectedExisting.length * 3, "incomplete existing AU recordings");
  for (const owner of expectedExisting) for (const kind of ["headword", "example-0", "example-1"]) {
    assert(existing.filter((a) => a.owner === owner && a.kind === kind && a.locale === "en-AU").length === 1, `${owner}:${kind}: missing or duplicated AU recording`);
  }
  for (const clip of existing) {
    const word = snapshots[clip.owner]?.["zh-Hant"];
    const expected = clip.kind === "headword" ? word?.word : word?.examples?.find((e: Json) => e.sortOrder === Number(clip.kind.slice(-1)))?.en;
    assert(clip.locale === "en-AU" && clip.sourceText === expected, `${clip.owner}:${clip.kind}: existing source text drift`);
    asset(clip, path.join(source, "existing-card-au-audio"), clip.kind, clip.owner, clip.locale, expected);
  }
  for (const clip of pkg.additionalAudio ?? []) asset(clip, path.join(source, "audio"), clip.kind, clip.owner, clip.locale, clip.text);
  const content = {
    schemaVersion: 1, kind: "australian-mixed-atlas", productionWriteAllowed: false,
    sourcePins, japanTransitBaseline: japanBaseline, newCategory: AUSTRALIAN_HOUSING_CATEGORY, newWordIds: ids, categoryAssignments: AUSTRALIAN_CATEGORY_ASSIGNMENTS, headwords: entries.map((e) => ({ id: e.id, en: e.candidate.word, ja: e.candidate.ja })), reservedIds: reserved, existingAudioOwners: [...new Set(existing.map((a) => a.owner))],
    regionalCandidateIds: pkg.existingRegionalImageCandidates.map((a: Json) => a.id), artifacts,
    gates: {
      deployedIsolation: "pending", independentTextReview: "pending", categoryReview: "pending", pronunciationReview: "pending",
      audioListening: options.listeningWaivedByUser ? "waived-by-user-not-listened" : "pending", opalAppearanceAndRights: "pending", productionDatabasePreflight: "not-checked",
      productionStorageTarget: "not-checked", deviceAndCacheVerification: "not-checked",
    },
    note: "Planning only; no apply path exists. A deployment identity and independent evidence for every guarded route, source-matched editorial/audio decisions, fresh DB/Storage preflight, and an audited atomic publisher are required before publication.",
  };
  return { ...content, planDigest: digest(content), createdAt: new Date().toISOString(), summary: { newWords: ids.length, artifacts: artifacts.length, images: artifacts.filter((a) => a.bucket === "word-images").length, audio: artifacts.filter((a) => a.bucket === "word-audio").length } };
}

/** SELECT-only collision probe; no sequence reservation, insert or UPDATE. */
export async function preflightAustralianDatabase(sql: ReturnType<typeof postgres>, plan: ReturnType<typeof prepareAustralianPlan>) {
  const words: { id: string; en: string; ja: string }[] = plan.headwords;
  assert(words.length === plan.newWordIds.length && new Set(words.map((w) => w.id)).size === words.length && words.every((w) => plan.newWordIds.includes(w.id) && w.en && w.ja), "preflight words do not match pinned IDs");
  return sql.begin("read only", async (tx) => {
    const ids = words.map((w) => w.id), en = words.map((w) => w.en.toLowerCase()), ja = words.map((w) => w.ja);
    const [identity] = await tx`SELECT current_database() AS database_name, current_user AS database_user`;
    const idCollisions = await tx`SELECT id, status FROM words WHERE id = ANY(${ids}) ORDER BY id`;
    const englishCollisions = await tx`SELECT id, word, status FROM words WHERE lower(word) = ANY(${en}) OR EXISTS (SELECT 1 FROM unnest(COALESCE(also_known_as, ARRAY[]::text[])) AS alias WHERE lower(alias) = ANY(${en})) ORDER BY id`;
    const japaneseCollisions = await tx`SELECT word_id, term FROM word_terms WHERE language = 'ja' AND term = ANY(${ja}) ORDER BY word_id`;
    return { checkedAt: new Date().toISOString(), databaseName: identity.database_name, databaseUser: identity.database_user, idCollisions, englishCollisions, japaneseCollisions, readyForGuardedApply: false, note: "SELECT only. Semantic duplicates, 19 deployed guards, all UI/API routes and missing human reviews remain separate gates." };
  });
}
