import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourceRoot = path.join(root, "output/convenience-store-publish-prep/source-images");
const outputRoot = path.join(root, "output/convenience-store-publish-prep/images");
const batchFiles = ["a", "b"].map((batch) =>
  path.join(root, `data/convenience-store-series-2026-09-batch-${batch}.json`),
);
const batchDocs = batchFiles.map((file) => ({
  file,
  document: JSON.parse(fs.readFileSync(file, "utf8")),
}));
const entries = batchDocs.flatMap(({ document }) => document.entries);
const selectedVersions = new Map([
  ["convenience-store-sign", "convenience-store-sign-v2.png"],
  ["cup-noodle-shelf", "cup-noodle-shelf-v2.png"],
]);

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const relative = (file) => path.relative(root, file);
const publicUrl = (storagePath) => `https://img.nexflow.team/word-images/${storagePath}`;

fs.mkdirSync(outputRoot, { recursive: true });
const images = [];
for (const entry of entries) {
  if (entry.id === "convenience-store") {
    const existingFile = path.join(sourceRoot, "convenience-store-existing.webp");
    if (!fs.existsSync(existingFile)) throw new Error("missing existing convenience-store image snapshot");
    const bytes = fs.readFileSync(existingFile);
    const metadata = await sharp(bytes).metadata();
    entry.imageUrl = "https://img.nexflow.team/word-images/convenience-store.webp";
    images.push({
      id: entry.id,
      mode: "reuse-existing",
      sourceFile: relative(existingFile),
      sourceSha256: sha256(bytes),
      localFile: relative(existingFile),
      contentSha256: sha256(bytes),
      bytes: bytes.length,
      width: metadata.width,
      height: metadata.height,
      mimeType: "image/webp",
      bucket: "word-images",
      storagePath: "convenience-store.webp",
      url: entry.imageUrl,
      license: "existing-catalog-asset",
      credit: null,
    });
    continue;
  }

  const sourceName = selectedVersions.get(entry.id) ?? `${entry.id}-v1.png`;
  const sourceFile = path.join(sourceRoot, sourceName);
  if (!fs.existsSync(sourceFile)) throw new Error(`${entry.id}: missing selected source image ${sourceName}`);
  const sourceBytes = fs.readFileSync(sourceFile);
  const webpBytes = await sharp(sourceBytes, { failOn: "none" })
    .resize(1200, 1200, { fit: "cover" })
    .webp({ quality: 82 })
    .toBuffer();
  const metadata = await sharp(webpBytes).metadata();
  if (metadata.format !== "webp" || metadata.width !== 1200 || metadata.height !== 1200) {
    throw new Error(`${entry.id}: normalized image is not a 1200 x 1200 WebP`);
  }
  const contentSha256 = sha256(webpBytes);
  const storagePath = `${entry.id}-ai-${contentSha256.slice(0, 12)}.webp`;
  const outputFile = path.join(outputRoot, storagePath);
  fs.writeFileSync(outputFile, webpBytes);
  entry.imageUrl = publicUrl(storagePath);
  images.push({
    id: entry.id,
    mode: "new-ai-generated",
    sourceFile: relative(sourceFile),
    sourceSha256: sha256(sourceBytes),
    localFile: relative(outputFile),
    contentSha256,
    bytes: webpBytes.length,
    width: metadata.width,
    height: metadata.height,
    mimeType: "image/webp",
    bucket: "word-images",
    storagePath,
    url: entry.imageUrl,
    license: "ai-generated",
    credit: "OpenAI ImageGen",
  });
}

for (const { file, document } of batchDocs) {
  fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
}

const categorySource = path.join(sourceRoot, "category-convenience-store-v2.png");
const categorySourceBytes = fs.readFileSync(categorySource);
const categoryBytes = await sharp(categorySourceBytes, { failOn: "none" })
  .resize(1200, 1200, { fit: "cover" })
  .webp({ quality: 82 })
  .toBuffer();
const categoryMetadata = await sharp(categoryBytes).metadata();
const categorySha256 = sha256(categoryBytes);
const categoryStoragePath = `category-convenience-store-ai-${categorySha256.slice(0, 12)}.webp`;
const categoryOutput = path.join(outputRoot, categoryStoragePath);
fs.writeFileSync(categoryOutput, categoryBytes);

const manifest = {
  schemaVersion: 1,
  series: "convenience-store",
  state: "candidate-images-reviewed-and-normalized",
  productionWriteAllowed: false,
  generatedWith: "OpenAI ImageGen built-in tool",
  normalization: { format: "webp", width: 1200, height: 1200, quality: 82 },
  summary: {
    words: images.length,
    newImages: images.filter(({ mode }) => mode === "new-ai-generated").length,
    reusedImages: images.filter(({ mode }) => mode === "reuse-existing").length,
    categoryImages: 1,
    rejectedAttempts: 3,
  },
  rejectedAttempts: [
    {
      target: "convenience-store-sign",
      sourceFile: "not-selected: initial ImageGen output",
      reason: "green-white-blue banding resembled an existing convenience-store brand",
    },
    {
      target: "cup-noodle-shelf",
      sourceFile: relative(path.join(sourceRoot, "cup-noodle-shelf-v1.png")),
      reason: "plain tall cups were too easily mistaken for drink cups",
    },
    {
      target: "category-convenience-store",
      sourceFile: relative(path.join(sourceRoot, "category-convenience-store-v1.png")),
      reason: "small product packages contained pseudo-text-like visual details",
    },
  ],
  images,
  category: {
    id: "convenience-store",
    mode: "new-ai-generated",
    sourceFile: relative(categorySource),
    sourceSha256: sha256(categorySourceBytes),
    localFile: relative(categoryOutput),
    contentSha256: categorySha256,
    bytes: categoryBytes.length,
    width: categoryMetadata.width,
    height: categoryMetadata.height,
    mimeType: "image/webp",
    bucket: "word-images",
    storagePath: categoryStoragePath,
    url: publicUrl(categoryStoragePath),
    license: "ai-generated",
    credit: "OpenAI ImageGen",
  },
};

const manifestFile = path.join(root, "output/convenience-store-publish-prep/image-manifest.json");
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ manifestFile, ...manifest.summary, categoryUrl: manifest.category.url }, null, 2));
