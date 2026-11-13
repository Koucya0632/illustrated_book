// Seal an immutable plan for the travel-tokyo-2026-11 publisher. No writes anywhere but
// output/. Run prepare-travel-tokyo-2026-11.mjs first. Reads the four existing categories
// with a SELECT-only transaction so the publisher can prove nothing moved under it.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import postgres from 'postgres';

const root = path.resolve(import.meta.dirname, '..'), out = path.join(root, 'output/travel-tokyo-2026-11');
const read = (p) => fs.readFileSync(path.join(root, p));
const json = (p) => JSON.parse(read(p));
const sha = (x) => createHash('sha256').update(x).digest('hex');
const canonical = (x) => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object'
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : x;
const digest = (x) => sha(JSON.stringify(canonical(x)));
const insist = (v, m) => { if (!v) throw new Error(m); };

const files = {
  content: 'data/travel-tokyo-2026-11.json',
  spans: 'data/example-spans-travel-tokyo-2026-11.json',
  mediaIndex: 'output/travel-tokyo-2026-11/media-index.json',
  publisher: 'scripts/publish-travel-tokyo-2026-11.ts',
  planner: 'scripts/prepare-travel-tokyo-2026-11-publish-plan.mjs',
  preparation: 'scripts/prepare-travel-tokyo-2026-11.mjs',
};
const sources = Object.fromEntries(Object.entries(files).map(([k, file]) => [k, {file, sha256: sha(read(file))}]));
const data = json(files.content), spans = json(files.spans), media = json(files.mediaIndex);

const EXISTING = ['festivals', 'restaurant', 'street', 'supermarket'];
const sql = postgres(process.env.DATABASE_URL, {max: 1, ssl: 'require', prepare: false, connect_timeout: 10});
let categoriesBefore;
try {
  categoriesBefore = await sql.begin('read only', async (tx) => ({
    categories: await tx`SELECT id, name, name_zh, emoji, description, description_en, color, image_url
      FROM categories WHERE id = ANY(${EXISTING}) ORDER BY id`,
    translations: await tx`SELECT category_id, language, name, description
      FROM category_translations WHERE category_id = ANY(${EXISTING}) ORDER BY category_id, language`,
    newCategoryRows: (await tx`SELECT id FROM categories WHERE id = 'shrines-and-temples'`).length,
  }));
} finally { await sql.end({timeout: 5}); }
insist(categoriesBefore.categories.map((c) => c.id).join(',') === EXISTING.join(','), 'all four existing categories required');
insist(categoriesBefore.newCategoryRows === 0, 'shrines-and-temples already exists');
delete categoriesBefore.newCategoryRows;

const c = data.newCategory;
const shrine = media.images['shinto-shrine'];
const newCategory = {
  id: c.id, name: c.labels.en, nameZh: c.labels['zh-Hant'], nameJa: c.labels.ja, emoji: '⛩️',
  description: c.descriptions['zh-Hant'], descriptionEn: c.descriptions.en, descriptionJa: c.descriptions.ja,
  color: 'from-red-100 to-orange-100',
  // No separate cover was made: the topic uses its own 神社 card as its picture.
  imageUrl: `https://img.nexflow.team/word-images/${shrine.storagePath}`,
  free: c.isFree,
};
insist(newCategory.free === false, 'shrines-and-temples is a member topic');

const mapClip = (key) => {
  const clip = media.clips[key];
  insist(clip, `missing clip ${key}`);
  const bytes = read(clip.localFile);
  insist(bytes.length === clip.bytes && sha(bytes) === clip.contentSha256, `${key}: local clip bytes`);
  return {kind: clip.kind, ownerKey: clip.ownerKey, wordId: clip.wordId, ...(clip.slot === null ? {} : {slot: clip.slot, sortOrder: clip.slot}),
    locale: clip.locale, sourceText: clip.sourceText, sourceLanguage: clip.locale === 'ja-JP' ? 'ja' : 'en',
    sourceDigest: sha(`${clip.locale}\0${clip.sourceText}`), localFile: clip.localFile, bytes: clip.bytes,
    contentSha256: clip.contentSha256, mimeType: 'audio/mpeg', model: 'chirp-3-hd', voice: `${clip.locale}-Chirp3-HD`,
    bucket: 'word-audio', storagePath: clip.storagePath, uploadRequired: clip.kind === 'example'};
};
const locales = ['en-US', 'en-GB', 'ja-JP'];
const entries = data.entries.map((entry) => {
  const im = media.images[entry.id];
  const bytes = read(im.localFile);
  insist(bytes.length === im.bytes && sha(bytes) === im.contentSha256, `${entry.id}: image bytes`);
  const image = {id: entry.id, bucket: 'word-images', storagePath: im.storagePath, url: `https://img.nexflow.team/word-images/${im.storagePath}`,
    localFile: im.localFile, sourceFile: im.localFile, bytes: im.bytes, contentSha256: im.contentSha256, mimeType: 'image/webp',
    width: im.width, height: im.height, license: 'AI-generated', credit: 'OpenAI image generation', uploadRequired: false};
  const {batch, spot, examples: rawExamples, ...rest} = entry;
  const word = {...rest, localizedNotes: {}, imageUrl: image.url};
  const examples = rawExamples.map((example, slot) => {
    insist(spans.en[example.en] && spans.ja[example.ja], `${entry.id}:${slot} spans missing`);
    return {ownerKey: `${entry.id}:${slot}`, sortOrder: slot, ...example, spans: {en: spans.en[example.en], ja: spans.ja[example.ja]},
      audio: locales.map((l) => mapClip(`example|${entry.id}:${slot}|${l}`))};
  });
  return {operation: 'insert', batch, spot, contentDigest: digest(word), word, image,
    headwordAudio: locales.map((l) => mapClip(`headword|${entry.id}|${l}`)), examples};
});
const audioClips = entries.reduce((n, e) => n + e.headwordAudio.length + e.examples.reduce((m, x) => m + x.audio.length, 0), 0);
const content = {
  schemaVersion: 1, series: 'travel-tokyo-2026-11', workBatches: data.workBatches,
  mode: 'new-category-and-expansion', productionWriteAllowed: false,
  releaseShape: {insertWordIds: entries.map((e) => e.word.id), updateWordIds: [], newCategoryIds: [newCategory.id]},
  newCategory,
  categories: [
    ...EXISTING.map((id) => ({id, existing: true, free: false})),
    {id: newCategory.id, existing: false, free: false},
  ],
  categoriesBefore,
  sources,
  // Recorded, not re-hashed by the publisher: these live in the parent repo.
  contentDepartmentSources: data.sources,
  entries,
  independentReviews: {semantic: 'pass', visual: 'pass', audio: 'pass', nativeJapanese: 'waived-by-user-2026-11-13'},
  summary: {words: entries.length, examples: entries.length * 2, wordImages: entries.length, categoryImages: 0, audioClips,
    storageObjects: entries.length + audioClips},
  applyContract: [
    'Fresh SELECT-only preflight; confirm logical DB and physical Storage targets immediately before apply.',
    'Images and headword clips were uploaded by the content department; the publisher only verifies their bytes.',
    'Example clips are uploaded create-only to examples/{exampleId}/ once IDs are reserved.',
    'One transaction creates shrines-and-temples with its Japanese translation, inserts all 24 words, and publishes them.',
    'Existing categories are reused unchanged.',
  ],
  limitations: [
    'Japanese text was not checked by a native speaker; the user waived that review on 2026-11-13.',
    'Usage notes exist in Traditional Chinese only; other interfaces fall back to it.',
    'The new topic uses the 神社 word picture as its cover.',
  ],
};
// The targets this plan was checked against, identified the way the publisher does.
const parsed = new URL(process.env.DATABASE_URL);
const databaseHostFingerprint = sha(`${parsed.protocol}//${parsed.username}@${parsed.hostname}:${parsed.port}/${parsed.pathname.replace(/^\//, '')}`).slice(0, 12);
const backend = process.env.R2_ACCOUNT_ID ? 'r2' : 'supabase';
const identity = backend === 'r2'
  ? {backend, accountId: process.env.R2_ACCOUNT_ID ?? '', bucket: process.env.R2_BUCKET ?? '', endpoint: process.env.R2_ENDPOINT ?? '', publicBase: process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? ''}
  : {backend, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''};
const plan = {...content, planDigest: digest(content), createdAt: new Date().toISOString(), status: 'prepared',
  databasePreflight: {databaseHostFingerprint, mode: 'read-only transaction', categoriesBefore},
  storageTarget: {backend, fingerprint: sha(JSON.stringify(identity)).slice(0, 12)}};
const bytes = Buffer.from(JSON.stringify(plan, null, 2) + '\n'), file = `publish-plan-${sha(bytes)}.json`;
fs.writeFileSync(path.join(out, file), bytes, {flag: 'wx'});
fs.writeFileSync(path.join(out, 'publish-plan.json'), bytes);
console.log(JSON.stringify({file, planDigest: plan.planDigest, summary: plan.summary}, null, 2));
