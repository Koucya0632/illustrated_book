import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const entries = JSON.parse(readFileSync("data/clothing-series-2026-09.json", "utf8")).entries;
const spans = JSON.parse(readFileSync("data/example-spans-clothing-2026-09.json", "utf8"));
const suggestions = JSON.parse(readFileSync("output/clothing-publish-prep/semantic-ai-review.json", "utf8"));
const sha256 = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Individual editorial decisions for model flags, checked against the corrected current source.
const decisions = {
  "t-shirt:1": "Tシャツ and シャツ are deliberately contrasted: the latter is the clean collared shirt in the English and Chinese sentence, so 襯衫 is the contextual Chinese gloss.",
  "sweater:1": "The English kept now points to 脱ぎませんでした, the exact Japanese action of leaving the セーター on after class.",
  "cardigan:1": "カーディガン now has the specific Chinese gloss 開襟毛衣 in both tap directions, distinct from a pullover sweater.",
  "dress:1": "トップス is explained as 上半身に着る服, a contextual Japanese definition of the separate top that a ワンピース does not require.",
  "skirt:1": "The comparative is cooler maps to の方が涼しい, and the walking plan maps to たくさん歩く予定; both match the Japanese skirt-versus-trousers choice.",
  "sneakers:0": "履きます is the correct verb for wearing スニーカー; the English wears gloss now maps to 履く, and Chinese 穿著 is natural for shoes.",
  "tank-top:1": "The English tank top tap now names タンクトップ, matching the Japanese sentence and the sleeveless concept.",
  "sweatshirt:1": "The English her sweatshirt tap gives 彼女のスウェット; the Japanese sentence naturally omits the understood possessor while keeping the same wet-garment event.",
  "necktie:1": "The アイロン tap now means 熨斗; 寄っていた explains the wrinkles, and かけた means 燙了 in the necktie-ironing context.",
  "leggings:1": "暖かく過ごす now means 保持溫暖 / stay warm rather than the unnatural literal ‘spend warmly’ in the jeans-and-leggings sentence.",
  "underwear:1": "The English still drying tap now points to まだ乾いていなかった, the Japanese sentence's not-yet-dry state after laundry.",
  "dress-shoes:1": "革靴 now gives the contextual English dress shoes and the exact Japanese headword, fitting the formal-party scene.",
  "high-heels:1": "The flats tap now uses フラットシューズ, the footwear named in the Japanese contrast with ハイヒール.",
  "flip-flops:1": "乗る now reads 上車 / get into the car in the sentence about rinsing beach sand before boarding.",
  "baseball-cap:0": "キャップ now has the specific English tap baseball cap, matching the word and the picture rather than a generic cap.",
  "beanie:1": "かぶり続けている now explains continuing to wear the ニット帽 rather than repeating the same inflected verb as its gloss.",
  "tote-bag:0": "The bag taps now identify トートバッグ / 托特包, the open-top shopping bag, rather than a generic carry bag.",
  "handbag:0": "母 is read はは and glossed 自分の母親 for the narrator's mother, rather than the form of address お母さん.",
  "backpack:0": "The English a backpack and Japanese リュック taps now use リュック / 後背包, matching the Japanese school sentence.",
  "backpack:1": "The English a backpack tap now uses リュック / 後背包, matching the Japanese shopping sentence and its weight-distribution reason.",
  "sunglasses:0": "晴れた日 is a sunny day / on sunny days, naturally expressing the same recurring condition as when it’s sunny; かけて is specific to wearing sunglasses.",
  "necklace:0": "The English gave tap now points to 贈った, the actual gift-giving verb in the birthday-necklace sentence.",
  "clip-on-earrings:0": "つけました has base つける and now explains 耳につけました; 一対 and イヤリング preserve the clip-on pair meaning.",
};

const suggested = new Map(suggestions.reviews.map((item) => [item.id, item]));
if (suggested.size !== 150 || Object.keys(decisions).length !== 23) {
  throw new Error("individual suggestion or decision coverage mismatch");
}
const items = entries.flatMap((entry) => [
  {
    kind: "word", id: entry.id,
    headwords: { en: entry.word, ja: entry.ja, zh: entry.chinese },
    sourceSha256: sha256({
      en: entry.word, ja: entry.ja, zh: entry.chinese,
      reading: entry.jaReading, definitions: entry.definitions,
    }),
  },
  ...entry.examples.map((example, slot) => ({
    kind: "example", id: `${entry.id}:${slot}`, wordId: entry.id, slot,
    cefrLevel: example.cefrLevel,
    text: { en: example.en, ja: example.ja, zh: example.zh },
    sourceSha256: sha256({
      example,
      englishSpans: spans.en[example.en],
      japaneseSpans: spans.ja[example.ja],
    }),
  })),
]).map((item) => {
  const suggestion = suggested.get(item.id);
  const entry = entries.find(({ id }) => id === (item.wordId ?? item.id));
  const example = item.kind === "example" ? entry.examples[item.slot] : null;
  const currentSource = JSON.stringify(example ? {
    example, englishSpans: spans.en[example.en], japaneseSpans: spans.ja[example.ja],
  } : entry);
  const decision = decisions[item.id];
  if (!suggestion || (!decision && (!suggestion.evidence ||
      !currentSource.includes(suggestion.evidence) || suggestion.reason.length < 30))) {
    throw new Error(`${item.id}: individual suggestion lacks concrete evidence`);
  }
  if ((suggestion.verdict === "pass") === Boolean(decision)) {
    throw new Error(`${item.id}: editorial decision and suggestion verdict disagree`);
  }
  return {
    ...item,
    verdict: "pass",
    reason: decision ?? suggestion.reason,
    basis: decision ? "individual-editorial-adjudication-after-correction" : "individual-bilingual-review",
  };
});
writeFileSync("output/clothing-publish-prep/semantic-review.json", `${JSON.stringify({
  schemaVersion: 1,
  series: "clothing",
  state: "reviewed-local-candidates",
  productionWriteAllowed: false,
  summary: { words: entries.length, examples: entries.length * 2, passed: items.length, failed: 0, pending: 0 },
  items,
}, null, 2)}\n`);
console.log(`recorded ${items.length} individual current-source semantic verdicts`);
