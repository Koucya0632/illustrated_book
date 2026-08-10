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
  // 酢 takes rendaku after a modifier. JMdict lists 穀物酢 as こくもつす and
  // リンゴ酢 as りんごす; kept voiced deliberately, because the four of these
  // are one family and splitting it would be worse than either choice alone.
  黒酢: "くろず",
  米酢: "こめず",
  穀物酢: "こくもつず",
  リンゴ酢: "リンゴず",
  // 連濁 the model missed, confirmed against JMdict.
  目覚まし時計: "めざましどけい",
  書類棚: "しょるいだな",
  // …and the mirror-image error, a rendaku the model added that does not occur.
  写真立て: "しゃしんたて",
  爪切り: "つめきり",
  // 口 is コウ in this compound; ぐち is the standalone-suffix reading.
  排水口: "はいすいこう",
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
