import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { processCollectionAvatarImage } from "../lib/atlas/collection-avatar-image";

async function solid(r: number, g: number, b: number) {
  return sharp({
    create: { width: 16, height: 16, channels: 3, background: { r, g, b } },
  })
    .jpeg()
    .toBuffer();
}

test("a collection avatar becomes a metadata-free square and an independent public color", async () => {
  const input = await sharp(await solid(255, 0, 0))
    .withMetadata({ exif: { IFD0: { ImageDescription: "private note" } } })
    .jpeg()
    .toBuffer();

  const result = await processCollectionAvatarImage(input);
  const metadata = await sharp(result.bytes).metadata();

  assert.equal(result.color, "#ff0000");
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);
  assert.equal(metadata.exif, undefined);
});

test("pure white and pure black never become a public collection color", async () => {
  for (const input of [await solid(255, 255, 255), await solid(0, 0, 0)]) {
    const result = await processCollectionAvatarImage(input);
    assert.match(result.color, /^#[0-9a-f]{6}$/);
    assert.notEqual(result.color, "#ffffff");
    assert.notEqual(result.color, "#000000");
  }
});
