// Converts the content department's reviewed Tokyo spot batches (travel-tokyo-01/02/03,
// docs/content in the parent repo) into the main-catalogue release shape the guarded
// publisher reads. Writes repository data and a local copy of every media artifact.
// No database or Storage access: every media object was already uploaded and verified
// by the content department (their upload receipts are recorded as sources).
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const parent = path.resolve(process.env.TUJI_PARENT ?? path.join(root, '../../..'));
const out = path.join(root, 'output/travel-tokyo-2026-11');
const sha = (x) => createHash('sha256').update(x).digest('hex');
const insist = (v, m) => { if (!v) throw new Error(m); };
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const BATCHES = [
  {dir: 'travel-tokyo', media: 'output/travel-tokyo'},
  {dir: 'travel-tokyo-03', media: 'output/travel-tokyo-03'},
];

const entries = [];
const spans = {en: {}, ja: {}};
const media = {images: {}, clips: {}};
let category = null;
const sources = {};

for (const batch of BATCHES) {
  const candidatesFile = path.join(parent, 'docs/content', batch.dir, 'candidates.json');
  const manifestFile = path.join(parent, batch.media, 'media-manifest.json');
  const receiptFile = path.join(parent, batch.media, 'upload-receipt.json');
  const candidatesBytes = fs.readFileSync(candidatesFile);
  const candidates = JSON.parse(candidatesBytes);
  const manifest = read(manifestFile);
  const receipt = read(receiptFile);
  insist(manifest.candidatesSha256 === sha(candidatesBytes), `${batch.dir}: media manifest is for different candidates`);
  for (const [k, file] of [['candidates', candidatesFile], ['mediaManifest', manifestFile], ['uploadReceipt', receiptFile]]) {
    sources[`${batch.dir}:${k}`] = {file: path.relative(parent, file), sha256: sha(fs.readFileSync(file))};
  }
  for (const review of ['independent-review-content.json', 'independent-review-images.json', 'independent-review-audio.json']) {
    const file = path.join(parent, 'docs/content', batch.dir, review);
    sources[`${batch.dir}:${review}`] = {file: path.relative(parent, file), sha256: sha(fs.readFileSync(file))};
  }
  if (category) insist(JSON.stringify(category) === JSON.stringify(candidates.category), 'batches disagree on the new category');
  category = candidates.category;

  // The uploaded object for each artifact, found by content hash.
  const objectBySha = new Map();
  for (const [key, object] of Object.entries(receipt.objects)) {
    insist(object.status === 'verified', `${key}: not verified in the upload receipt`);
    objectBySha.set(object.sha256, {key, ...object});
  }

  for (const word of candidates.words) {
    insist(!entries.some((e) => e.id === word.id), `${word.id}: duplicate across batches`);
    insist(word.examples.length === 2, `${word.id}: exactly two examples required`);
    const examples = word.examples.map((ex, slot) => {
      insist(ex.sortOrder === slot, `${word.id}: example order`);
      for (const language of ['en', 'ja']) {
        const list = ex.clickTranslations[language].spans.map((s) => {
          const span = {t: s.text};
          if (s.gloss) Object.assign(span, {z: s.gloss.zh, j: s.gloss.ja, e: s.gloss.en});
          if (s.reading) span.r = s.reading;
          return span;
        });
        insist(list.map((s) => s.t).join('') === ex[language], `${word.id}:${slot} ${language} spans do not rebuild the sentence`);
        insist(list.every((s) => !s.z || (s.j && s.e)), `${word.id}:${slot} ${language} gloss missing a language`);
        if (language === 'ja') insist(list.every((s) => !s.z || s.r), `${word.id}:${slot} ja tappable span without reading`);
        insist(!spans[language][ex[language]] || JSON.stringify(spans[language][ex[language]]) === JSON.stringify(list), `${ex[language]}: same sentence, different spans`);
        spans[language][ex[language]] = list;
      }
      return {en: ex.en, ja: ex.ja, zh: ex.zh, cefrLevel: ex.cefrLevel};
    });
    entries.push({
      id: word.id,
      word: word.enTerm,
      chinese: word.zhDefinition,
      chineseDefinition: word.zhExplanation,
      category: word.category,
      partOfSpeech: word.partOfSpeech,
      pronunciation: word.pronunciation,
      cefrLevel: word.cefrLevel,
      ja: word.jaTerm,
      jaReading: word.jaReading,
      jaReadingSegments: word.readingSegments,
      definitions: [
        {language: 'zh', definition: word.zhDefinition, sortOrder: 0},
        {language: 'en', definition: word.enDefinition, sortOrder: 0},
        {language: 'ja', definition: word.jaDefinition, sortOrder: 0},
      ],
      note: word.note,
      relatedWords: word.relatedWords,
      batch: word.batch,
      spot: word.spot,
      examples,
    });

    const image = manifest.images.find((i) => i.id === word.id);
    insist(image, `${word.id}: no image`);
    const imageObject = objectBySha.get(image.sha256);
    insist(imageObject && imageObject.key.startsWith('word-images/'), `${word.id}: image not uploaded`);
    const imageLocal = path.join(out, 'media', imageObject.key);
    fs.mkdirSync(path.dirname(imageLocal), {recursive: true});
    fs.copyFileSync(path.join(parent, batch.media, image.webp), imageLocal);
    insist(sha(fs.readFileSync(imageLocal)) === image.sha256, `${word.id}: local image bytes`);
    media.images[word.id] = {
      bucket: 'word-images', storagePath: imageObject.key.replace(/^word-images\//, ''),
      localFile: path.relative(root, imageLocal), bytes: image.bytes, contentSha256: image.sha256,
      width: image.width, height: image.height,
    };

    for (const clip of manifest.clips.filter((c) => c.wordId === word.id)) {
      const object = objectBySha.get(clip.sha256);
      insist(object, `${clip.ownerKey} ${clip.locale}: clip not uploaded`);
      const local = path.join(out, 'media', 'word-audio', clip.kind, clip.locale, `${clip.sha256}.mp3`);
      fs.mkdirSync(path.dirname(local), {recursive: true});
      fs.copyFileSync(path.join(parent, batch.media, clip.file), local);
      insist(sha(fs.readFileSync(local)) === clip.sha256, `${clip.ownerKey}: local clip bytes`);
      const expected = clip.kind === 'headword'
        ? (clip.locale === 'ja-JP' ? word.jaTerm : word.enTerm)
        : word.examples[clip.slot][clip.locale === 'ja-JP' ? 'ja' : 'en'];
      insist(clip.displayText === expected, `${clip.ownerKey} ${clip.locale}: clip text ${clip.displayText} ≠ ${expected}`);
      media.clips[`${clip.kind}|${clip.ownerKey}|${clip.locale}`] = {
        kind: clip.kind, ownerKey: clip.ownerKey, wordId: word.id, slot: clip.slot ?? null, locale: clip.locale,
        sourceText: clip.displayText, spokenText: clip.sourceText,
        // Headword clips stay where the content department put them; example clips move
        // from their staging path to the example's own path once its ID exists.
        storagePath: clip.kind === 'headword'
          ? object.key.replace(/^word-audio\//, '')
          : `examples/{exampleId}/${clip.locale}/${clip.sha256.slice(0, 20)}.mp3`,
        localFile: path.relative(root, local), bytes: clip.bytes, contentSha256: clip.sha256,
      };
    }
  }
}

insist(entries.length === 24, `expected 24 words, found ${entries.length}`);
insist(Object.keys(media.clips).length === 24 * 9, 'expected nine clips per word');
const data = {
  schemaVersion: 1,
  series: 'travel-tokyo-2026-11',
  workBatches: ['travel-tokyo-01', 'travel-tokyo-02', 'travel-tokyo-03'],
  region: 'Japan',
  scopeNote: '跟著 Moira 去旅遊的東京景點詞條，以及新主題「神社與寺」。',
  newCategory: category,
  nativeReview: '2026-11-13 使用者決定不經母語者核對直接發佈。',
  sources,
  entries,
};
fs.writeFileSync(path.join(root, 'data/travel-tokyo-2026-11.json'), JSON.stringify(data, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'data/example-spans-travel-tokyo-2026-11.json'), JSON.stringify(spans, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'media-index.json'), JSON.stringify(media, null, 2) + '\n');
console.log(JSON.stringify({words: entries.length, images: Object.keys(media.images).length, clips: Object.keys(media.clips).length,
  categories: [...new Set(entries.map((e) => e.category))]}, null, 2));
