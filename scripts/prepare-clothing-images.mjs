// Convert verified local clothing assets into the immutable publish-plan shape.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const input = JSON.parse(readFileSync("output/clothing-images/image-manifest.json", "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const images = input.items.map((item) => {
  const bytes = readFileSync(item.formal);
  if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256) {
    throw new Error(`${item.id}: source image bytes differ from manifest`);
  }
  if (!item.storagePath.startsWith("word-images/") ||
      !item.storagePath.endsWith(`-${item.sha256.slice(0, 12)}.webp`)) {
    throw new Error(`${item.id}: storage path is not content-addressed`);
  }
  return {
    id: item.id === "category" ? "category:clothing" : item.id,
    sourceFile: item.source,
    sourceSha256: item.sourceSha256,
    localFile: item.formal,
    contentSha256: item.sha256,
    bytes: item.bytes,
    width: item.width,
    height: item.height,
    mimeType: item.mimeType,
    bucket: "word-images",
    storagePath: item.storagePath.slice("word-images/".length),
    url: `https://img.nexflow.team/${item.storagePath}`,
    license: "AI-generated for Tuji",
    credit: "Tuji",
  };
});
const categoryImage = images.find(({ id }) => id === "category:clothing");
const wordImages = images.filter(({ id }) => id !== "category:clothing");
if (!categoryImage || wordImages.length !== 50 ||
    new Set(images.map(({ id }) => id)).size !== 51 ||
    new Set(images.map(({ storagePath }) => storagePath)).size !== 51) {
  throw new Error("expected one category image and 50 unique word images");
}
writeFileSync("output/clothing-publish-prep/image-manifest.json", `${JSON.stringify({
  schemaVersion: 1,
  series: "clothing",
  images: wordImages,
  categoryImage,
}, null, 2)}\n`);
console.log("prepared 50 clothing images and one category image for the publish plan");
