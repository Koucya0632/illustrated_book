// Readings decided by hand, because neither a model nor a bundled morphological
// dictionary gets them right.
//
// Both fail the same way: on a compound they do not hold as a single entry they
// fall back to composing character by character, and pick a kun-yomi where the
// compound wants on-yomi. 保湿 came out ほしめ (湿 read しめ instead of シツ) and
// 制汗剤 came out せいあせざい (汗 read あせ instead of カン) — from the model
// *and* from kuromoji/IPADIC independently, which is why cross-checking the two
// found nothing. Chinese-origin condiment names fail harder still: 豆板醤 is
// トウバンジャン in Japanese, never まめいたひしお.
//
// Keyed by the Japanese headword. `generateJapaneseReading` consults this before
// asking a model, so a correction made here survives every future backfill.

export const JA_READING_OVERRIDES: Record<string, string> = {
  // 湿 is シツ in these compounds, not しめ(る).
  保湿クリーム: "ほしつクリーム",
  除湿機: "じょしつき",
  // 汗 is カン in a Sino-Japanese compound.
  制汗剤: "せいかんざい",
  // 洗 is セン; しょくあらいき is not a word.
  食洗機: "しょくせんき",
  // 酢 takes rendaku after a modifier.
  黒酢: "くろず",
  米酢: "こめず",
  穀物酢: "こくもつず",
  リンゴ酢: "リンゴず",
  // Standard readings.
  日本酒: "にほんしゅ",
  白砂糖: "しろざとう",
  // The parenthesised Chinese name was left half-unread (…ろう抽 / …なま抽).
  "濃口醤油（老抽）": "こいくちしょうゆ（ろうちゅう）",
  "薄口醤油（生抽）": "うすくちしょうゆ（せいちゅう）",
  // Chinese-origin names: Japanese uses the borrowed pronunciation, in katakana.
  豆板醤: "トウバンジャン",
  沙茶醤: "サーチャージャン",
  花椒: "ホアジャオ",
  五香粉: "ウーシャンフェン",
};

export function overrideReading(term: string): string | undefined {
  return JA_READING_OVERRIDES[term];
}
