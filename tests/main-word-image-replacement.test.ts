import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { prepareMainWordImageCandidate } from "../lib/main-word-image-replacement";

test("main-word image replacements accept only named WebP candidates", async () => {
  const webp = await sharp({
    create: { width: 800, height: 800, channels: 3, background: "white" },
  }).webp().toBuffer();

  const prepared = await prepareMainWordImageCandidate("cleaner-v2.webp", webp);
  assert.equal(prepared.id, "cleaner");
  assert.match(prepared.sha256, /^[a-f0-9]{64}$/);
  assert.equal((await sharp(prepared.bytes).metadata()).format, "webp");

  await assert.rejects(
    prepareMainWordImageCandidate("cleaner-v2.png", webp),
    /expected <word-id>-v2\.webp/,
  );
});

test("a WebP suffix cannot disguise PNG replacement bytes", async () => {
  const png = await sharp({
    create: { width: 800, height: 800, channels: 3, background: "white" },
  }).png().toBuffer();
  await assert.rejects(
    prepareMainWordImageCandidate("cleaner-v2.webp", png),
    /candidate bytes are not WebP/,
  );
});
