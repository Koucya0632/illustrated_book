// Local-only: normalize individually reviewed source PNGs into immutable WebP
// candidates. This script never contacts production Storage or Postgres.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const candidateFile = path.join(root, "data/drugstore-series-2026-09.json");
const outputRoot = path.join(root, "output/drugstore-publish-prep");
const sourceRoot = path.join(outputRoot, "source-images");
const imageRoot = path.join(outputRoot, "images");
const candidate = JSON.parse(fs.readFileSync(candidateFile, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const sourceVersion = new Map([
  ["drugstore", "v2"],
  ["prescription-counter", "v2"],
  ["hair-mask", "v2"],
]);

fs.mkdirSync(imageRoot, { recursive: true });
const images = [];
for (const entry of candidate.entries) {
  const version = sourceVersion.get(entry.id) ?? "v1";
  const sourceFile = path.join(sourceRoot, `${entry.id}-${version}.png`);
  if (!fs.existsSync(sourceFile)) throw new Error(`${entry.id}: missing source image`);
  const sourceBytes = fs.readFileSync(sourceFile);
  const bytes = await sharp(sourceBytes, { failOn: "error" })
    .resize(1200, 1200, { fit: "contain", background: "#ffffff" })
    .webp({ quality: 82 })
    .toBuffer();
  const metadata = await sharp(bytes).metadata();
  if (metadata.format !== "webp" || metadata.width !== 1200 || metadata.height !== 1200) {
    throw new Error(`${entry.id}: invalid normalized WebP`);
  }
  const contentSha256 = sha256(bytes);
  const storagePath = `${entry.id}-ai-${contentSha256.slice(0, 12)}.webp`;
  const localFile = path.join(imageRoot, storagePath);
  fs.writeFileSync(localFile, bytes);
  const url = `https://img.nexflow.team/word-images/${storagePath}`;
  entry.imageUrl = url;
  images.push({
    id: entry.id,
    sourceFile: relative(sourceFile),
    sourceSha256: sha256(sourceBytes),
    localFile: relative(localFile),
    contentSha256,
    bytes: bytes.length,
    width: metadata.width,
    height: metadata.height,
    mimeType: "image/webp",
    bucket: "word-images",
    storagePath,
    url,
    license: "ai-generated",
    credit: "OpenAI ImageGen",
  });
}

const categorySourceFile = path.join(sourceRoot, "category-drugstore-v1.png");
const categorySourceBytes = fs.readFileSync(categorySourceFile);
const categoryBytes = await sharp(categorySourceBytes, { failOn: "error" })
  .resize(1200, 1200, { fit: "contain", background: "#ffffff" })
  .webp({ quality: 82 })
  .toBuffer();
const categorySha256 = sha256(categoryBytes);
const categoryPath = `category-drugstore-ai-${categorySha256.slice(0, 12)}.webp`;
const categoryFile = path.join(imageRoot, categoryPath);
fs.writeFileSync(categoryFile, categoryBytes);
const categoryMetadata = await sharp(categoryBytes).metadata();
const categoryImage = {
  id: "category:drugstore",
  sourceFile: relative(categorySourceFile),
  sourceSha256: sha256(categorySourceBytes),
  localFile: relative(categoryFile),
  contentSha256: categorySha256,
  bytes: categoryBytes.length,
  width: categoryMetadata.width,
  height: categoryMetadata.height,
  mimeType: "image/webp",
  bucket: "word-images",
  storagePath: categoryPath,
  url: `https://img.nexflow.team/word-images/${categoryPath}`,
  license: "ai-generated",
  credit: "OpenAI ImageGen",
};

if (new Set(images.map(({ id }) => id)).size !== candidate.entries.length ||
    new Set([...images, categoryImage].map(({ storagePath }) => storagePath)).size !== images.length + 1) {
  throw new Error("image ID or storage path collision");
}

fs.writeFileSync(candidateFile, `${JSON.stringify(candidate, null, 2)}\n`);
fs.writeFileSync(
  path.join(outputRoot, "image-manifest.json"),
  `${JSON.stringify({ schemaVersion: 1, series: "drugstore", images, categoryImage }, null, 2)}\n`,
);
console.log(JSON.stringify({ words: images.length, categoryImage: categoryPath, totalObjects: images.length + 1 }));
