import assert from "node:assert/strict";
import test from "node:test";
import { applyAustralianVariant, australianStudyHint, hiddenAustralianIds, australianVariant, validateAustralianVariants, visibleInDirection } from "../lib/australian-word-variants";
import { AUSTRALIAN_RENTAL_WORDS } from "../lib/australian-categories";
import type { AustralianWordVariants } from "../lib/australian-word-variants";
import type { Word } from "../types";

const audio = { "en-US": "https://example.test/us.mp3", "en-GB": "https://example.test/uk.mp3", "en-AU": "https://example.test/au.mp3" };
const example = (en: string, sortOrder: number, cefrLevel: "A2" | "B1") => ({
  en, zh: "交通卡", translations: { zh: "交通卡", ja: "交通カード" }, sortOrder, cefrLevel,
  audioUrls: audio, mentionedWordIds: ["transit-ic-card"],
});
const variants: AustralianWordVariants = {
  "transit-ic-card": {
    visibility: "shared", headword: "Opal card", pronunciation: "/ˈoʊpəl/",
    imageUrl: "https://example.test/opal.webp",
    gloss: { "zh-Hant": "Opal 交通卡", ja: "オパールカード", en: "Opal card" },
    explanation: { "zh-Hant": "雪梨交通卡", ja: "シドニーの交通カード", en: "Sydney transit card" },
    englishDefinition: "A Sydney transit card.",
    examples: [example("Tap your Opal card.", 0, "A2"), example("Top up before boarding.", 1, "B1")],
    audioUrls: audio,
  },
  "rental-bond": {
    visibility: "australia-only", headword: "rental bond", pronunciation: "/bond/",
    imageUrl: "https://example.test/bond.webp",
    gloss: { "zh-Hant": "押金", ja: "保証金", en: "bond" },
    explanation: { "zh-Hant": "租屋押金", ja: "賃貸保証金", en: "rental bond" },
    englishDefinition: "A tenancy bond.",
    examples: [
      { ...example("I paid a bond.", 0, "A2"), mentionedWordIds: ["rental-bond"] },
      { ...example("I checked the bond.", 1, "B1"), mentionedWordIds: ["rental-bond"] },
    ],
    audioUrls: audio,
  },
};
// Model the intended atomic activation of all six housing entries.
for (const id of AUSTRALIAN_RENTAL_WORDS) {
  if (!variants[id]) variants[id] = { ...variants["rental-bond"], examples: variants["rental-bond"].examples.map((example) => ({ ...example, mentionedWordIds: [id] })) };
}
const base = {
  id: "transit-ic-card", word: "transit IC card", imageUrl: "https://example.test/japan.webp",
  chinese: "交通卡", pronunciation: "old", audioUrls: { "en-US": "old.mp3" },
  definitions: [], examples: [], tags: [], relations: [],
} as unknown as Word;

test("published regional content requires complete assets and preserves the original", () => {
  validateAustralianVariants(variants);
  const altered = applyAustralianVariant(base, "zh-Hant", australianVariant(base.id, "zh-en", variants));
  assert.equal(altered.word, "Opal card");
  assert.equal(altered.audioUrls?.["en-US"], audio["en-US"]);
  assert.equal(altered.examples[0].en, "Tap your Opal card.");
  assert.equal(base.word, "transit IC card");
  assert.equal(base.audioUrls?.["en-US"], "old.mp3");
  assert.equal(applyAustralianVariant(base, "zh-Hant", australianVariant(base.id, "zh-ja", variants)), base);
});

test("Australian-only words do not appear in Japanese and no partial variant can publish", () => {
  assert(visibleInDirection("transit-ic-card", "zh-ja", variants));
  assert(!visibleInDirection("rental-bond", "zh-ja", variants));
  assert(visibleInDirection("rental-bond", "zh-en", variants));
  assert.deepEqual(new Set(hiddenAustralianIds("zh-ja", variants, ["rental-bond"])), new Set(AUSTRALIAN_RENTAL_WORDS));
  assert(!visibleInDirection("rental-bond", "zh-en", {}));
  assert.deepEqual(hiddenAustralianIds("zh-en", {}, ["rental-bond"]), ["rental-bond"]);
  const unreserved = structuredClone(variants);
  unreserved["transit-ic-card"].visibility = "australia-only";
  assert.throws(() => validateAustralianVariants(unreserved), /invalid published Australian variant/);
  const broken = structuredClone(variants);
  delete broken["transit-ic-card"].audioUrls["en-AU"];
  assert.throws(() => validateAustralianVariants(broken), /invalid published Australian variant/);
});

test("Australian study hints localize explanations without revealing the English answer", () => {
  const variant = variants["transit-ic-card"];
  assert.equal(australianStudyHint(variant, "zh-Hant", "Opal 交通卡"), "雪梨交通卡");
  assert.equal(australianStudyHint(variant, "zh-Hans", "Opal 交通卡"), "雪梨交通卡");
  assert.equal(australianStudyHint(variant, "ja", "オパールカード"), "シドニーの交通カード");
  assert.equal(australianStudyHint(variant, "en", "Opal card"), undefined);
  assert.equal(australianStudyHint(variant, "zh-Hant", "雪梨交通卡"), undefined);
});

test("image-only Australian variants retain live shared text and audio", async () => {
  const { applyAustralianImage, validateAustralianImages } = await import("../lib/australian-word-variants");
  const images = { "transit-ic-card": "https://example.test/au.webp" };
  validateAustralianImages(images, ["rental-bond"], {});
  const aus = applyAustralianImage(base, "zh-en", images);
  assert.equal(aus.imageUrl, images["transit-ic-card"]);
  assert.equal(aus.word, base.word);
  assert.equal(aus.audioUrls, base.audioUrls);
  assert.equal(aus.examples, base.examples);
  assert.equal(applyAustralianImage(base, "zh-ja", images), base);
  assert.throws(() => validateAustralianImages({ "rental-bond": "https://example.test/img.webp" }, ["rental-bond"], {}));
  assert.throws(() => validateAustralianImages({ "transit-ic-card": "http://example.test/img.webp" }, [], {}));
  assert.throws(() => validateAustralianImages(images, [], variants));
});


test("partially activated housing entries stay hidden in both directions", () => {
 const partial = { "rental-bond": variants["rental-bond"] };
 assert.equal(australianVariant("rental-bond", "zh-en", partial), undefined);
 assert.equal(visibleInDirection("rental-bond", "zh-en", partial, ["rental-bond"]), false);
 assert.equal(visibleInDirection("rental-bond", "zh-ja", partial, ["rental-bond"]), false);
});
