// A complete, reviewed two-word release written under output/ (gitignored),
// so the shared publisher can be driven end to end without production files.

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { planReleaseAudio, verifyReleaseAudio } from "../../lib/catalogue/publish/audio";
import type { ReleasePublishDescriptor } from "../../lib/catalogue/publish/descriptor";
import type { StoragePort } from "../../lib/catalogue/publish/storage";
import { publicObjectUrl } from "../../lib/storage/public-objects";

export const FIXTURE_ASSET_BASE = "https://assets.fixture.test";

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

export const hasFfmpeg = () =>
  spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

function writeJson(root: string, relative: string, value: unknown) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function buildReleaseFixture(root: string) {
  // publicObjectUrl reads this at call time; the plan, the fake Storage and the
  // publisher all mint URLs against it.
  process.env.NEXT_PUBLIC_ASSET_BASE_URL = FIXTURE_ASSET_BASE;
  const tag = randomUUID().slice(0, 6);
  const series = `fixture-topic-${tag}`;
  const dir = `output/release-fixture-${tag}`;
  const descriptor: ReleasePublishDescriptor = {
    release: `${series}-2026-12`,
    series,
    files: {
      candidates: `${dir}/data/candidates.json`,
      canonicalImages: `${dir}/data/image-urls.json`,
      authoredSemanticReview: `${dir}/data/semantic-review-authored.json`,
      authoredVisualReview: `${dir}/data/visual-review-authored.json`,
      imagePrompts: `${dir}/data/image-prompts.json`,
      spans: `${dir}/data/spans.json`,
      images: `${dir}/prep/image-manifest.json`,
      visualReview: `${dir}/prep/visual-review.json`,
      semanticReview: `${dir}/prep/semantic-review.json`,
      audioPlan: `${dir}/audio-plan/manifest.json`,
      audio: `${dir}/audio/generated-manifest.json`,
      audioVerification: `${dir}/audio/verification-report.json`,
      audioFrameVerification: `${dir}/audio/mp3-frames-report.json`,
    },
    prepDirectory: `${dir}/prep`,
    audioDirectory: `${dir}/audio`,
  };

  const image = async (id: string, background: { r: number; g: number; b: number }) => {
    const bytes = await sharp({ create: { width: 512, height: 512, channels: 3, background } }).webp().toBuffer();
    const contentSha256 = sha256(bytes);
    const name = `${id}-v1-${contentSha256.slice(0, 12)}.webp`;
    const localFile = `${dir}/images/${name}`;
    fs.mkdirSync(path.join(root, path.dirname(localFile)), { recursive: true });
    fs.writeFileSync(path.join(root, localFile), bytes);
    const storagePath = `${series}/${name}`;
    return {
      id, sourceFile: `${dir}/sources/${id}.png`, sourceSha256: contentSha256, localFile, contentSha256,
      bytes: bytes.length, width: 512, height: 512, mimeType: "image/webp", bucket: "word-images",
      storagePath, url: publicObjectUrl("word-images", storagePath), license: "AI-generated for Tuji", credit: "Tuji",
    };
  };

  const words = [
    { slug: "kettle", en: "kettle", ja: `やかん${tag}`, zh: `水壺${tag}`, color: { r: 200, g: 80, b: 60 } },
    { slug: "ladle", en: "ladle", ja: `おたま${tag}`, zh: `湯杓${tag}`, color: { r: 60, g: 120, b: 200 } },
  ];
  const spans: { en: Record<string, unknown[]>; ja: Record<string, unknown[]> } = { en: {}, ja: {} };
  const images = [];
  const entries = [];
  for (const [index, w] of words.entries()) {
    const id = `${series}-${w.slug}`;
    const headword = `fixture ${w.en} ${tag}`;
    const img = await image(id, w.color);
    images.push(img);
    const examples = [
      { en: `The ${w.en} is here.`, ja: `${w.ja}はここです。`, zh: `${w.zh}在這裡。`, cefrLevel: "A2" },
      { en: `I washed the ${w.en} after dinner.`, ja: `夕食の後で${w.ja}を洗いました。`, zh: `我晚餐後洗了${w.zh}。`, cefrLevel: "B1" },
    ];
    for (const example of examples) {
      const [first, ...rest] = example.en.split(` ${w.en}`);
      spans.en[example.en] = [{ t: `${first} ` }, { t: w.en, b: w.en, z: w.zh }, { t: rest.join(` ${w.en}`) }];
      spans.ja[example.ja] = [{ t: example.ja }];
    }
    entries.push({
      id, word: headword, chinese: w.zh, chineseDefinition: `用來測試的${w.zh}`, category: series,
      partOfSpeech: "noun", pronunciation: `/${w.en}/`, cefrLevel: "A2",
      definitions: [
        { language: "en", definition: `A ${w.en} used in the publisher test.`, sortOrder: 0 },
        { language: "ja", definition: `テスト用の${w.ja}。`, sortOrder: 0 },
        { language: "zh", definition: `測試用的${w.zh}。`, sortOrder: 0 },
      ],
      examples,
      relatedWords: [`${series}-${words[(index + 1) % words.length].slug}`],
      ja: w.ja, jaReading: w.ja, jaReadingSegments: null,
      imageUrl: img.url,
    });
  }
  const categoryImage = await image(`category-${series}`, { r: 240, g: 200, b: 80 });
  const category = {
    id: series, name: "Fixture Topic", nameZh: "測試主題", nameJa: "テスト", emoji: "🧪",
    description: "發佈器測試用", descriptionEn: "Publisher test topic", descriptionJa: "テスト用",
    color: "from-sky-100 to-amber-100", imageUrl: categoryImage.url,
  };
  writeJson(root, descriptor.files.candidates, { schemaVersion: 1, series, state: "reviewed", category, entries });
  writeJson(root, descriptor.files.canonicalImages, Object.fromEntries(entries.map((e) => [e.id, e.imageUrl])));
  writeJson(root, descriptor.files.authoredSemanticReview, { entries: [] });
  writeJson(root, descriptor.files.authoredVisualReview, { entries: [] });
  writeJson(root, descriptor.files.imagePrompts, { entries: [] });
  writeJson(root, descriptor.files.spans, spans);
  writeJson(root, descriptor.files.images, { images, categoryImage: { ...categoryImage, id: `category:${series}` } });
  const reviewed = [...images, { ...categoryImage, id: `category:${series}` }];
  writeJson(root, descriptor.files.visualReview, {
    summary: { passedWordImages: images.length, failedWordImages: 0, passedCategoryImages: 1 },
    reviews: reviewed.map(({ id, localFile, contentSha256 }) => ({ id, decision: "pass", localFile, contentSha256, reason: "fixture" })),
  });
  writeJson(root, descriptor.files.semanticReview, {
    summary: { passed: entries.length * 3, failed: 0 },
    items: entries.flatMap((entry) => [
      {
        id: entry.id, kind: "word", verdict: "pass", reason: "fixture",
        headwords: { en: entry.word, ja: entry.ja, zh: entry.chinese },
        sourceSha256: sha256(JSON.stringify({
          en: entry.word, ja: entry.ja, zh: entry.chinese, reading: entry.jaReading, definitions: entry.definitions,
        })),
      },
      ...entry.examples.map((example, slot) => ({
        id: `${entry.id}:${slot}`, kind: "example", verdict: "pass", reason: "fixture",
        cefrLevel: example.cefrLevel, text: { en: example.en, ja: example.ja, zh: example.zh },
        sourceSha256: sha256(JSON.stringify({
          example, englishSpans: spans.en[example.en], japaneseSpans: spans.ja[example.ja],
        })),
      })),
    ]),
  });

  // Real MP3s, one tone per clip, so the shared verifier decodes them fully.
  const audioPlan = planReleaseAudio(descriptor, root);
  const generated: Record<string, unknown> = {};
  for (const [index, job] of audioPlan.jobs.entries()) {
    const sourceDigest = sha256(`${job.locale}\0${job.text}`);
    const file = path.join(job.kind, job.locale, `${sourceDigest}.mp3`);
    const absolute = path.join(root, descriptor.audioDirectory, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const made = spawnSync("ffmpeg", [
      "-v", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=${300 + index * 20}:duration=0.2`,
      "-c:a", "libmp3lame", "-b:a", "32k", absolute,
    ]);
    if (made.status !== 0) throw new Error(`ffmpeg failed: ${made.stderr}`);
    const bytes = fs.readFileSync(absolute);
    generated[`${job.kind}|${job.ownerKey}|${job.locale}`] = {
      ...job, file, bytes: bytes.length, sha256: sha256(bytes), sourceText: job.text,
    };
  }
  writeJson(root, descriptor.files.audio, { schemaVersion: 1, series, voice: "Aoede", generated, failures: {} });
  const audioReport = verifyReleaseAudio(descriptor, root);
  if (!audioReport.passed) throw new Error(`fixture audio failed verification: ${audioReport.issues.join("; ")}`);

  return {
    descriptor,
    entries,
    cleanup: () => fs.rmSync(path.join(root, dir), { recursive: true, force: true }),
  };
}

/** In-memory public Storage. `failAfterPuts` makes the next write throw once
 * that many objects were written, to simulate an interrupted upload. */
export function memoryStorage() {
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  let puts = 0;
  const state = { failAfterPuts: Infinity };
  const storage: StoragePort = {
    async list(bucket) {
      return [...objects.keys()].filter((key) => key.startsWith(`${bucket}/`)).map((key) => key.slice(bucket.length + 1));
    },
    async put(bucket, storagePath, bytes, contentType) {
      if (puts >= state.failAfterPuts) throw new Error("simulated Storage outage");
      const key = `${bucket}/${storagePath}`;
      if (objects.has(key)) throw new Error(`${key} already exists`);
      objects.set(key, { bytes, contentType });
      puts += 1;
      return publicObjectUrl(bucket, storagePath);
    },
    async fetch(url) {
      const prefix = `${FIXTURE_ASSET_BASE}/`;
      if (!url.startsWith(prefix)) return { status: 404, contentType: null, bytes: Buffer.alloc(0) };
      const key = url.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
      const object = objects.get(key);
      return object
        ? { status: 200, contentType: object.contentType, bytes: object.bytes }
        : { status: 404, contentType: null, bytes: Buffer.alloc(0) };
    },
  };
  return { storage, objects, state };
}
