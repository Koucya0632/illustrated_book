// Kana/kanji character rules for Japanese readings.
//
// A "reading" here is furigana in the ordinary Japanese sense: kanji are
// spelled out in hiragana, and everything that is *already* kana stays exactly
// as written. Katakana loanwords therefore read as themselves — バスマット is
// バスマット, not ばすまっと, and シャンプー keeps its 長音符 rather than
// decaying into しゃんぷう.
//
// This matters beyond display: the iOS 拼字 stage builds its tiles from
// `reading`, so a hiragana-ised katakana word makes the app drill a spelling
// that does not exist.

export type KanaClass = "kanji" | "hiragana" | "katakana" | "other";

export function classify(ch: string): KanaClass {
  const c = ch.codePointAt(0) ?? 0;
  if (c >= 0x4e00 && c <= 0x9fff) return "kanji";
  if (c === 0x3005) return "kanji"; // 々 iteration mark
  if (c >= 0x3040 && c <= 0x309f) return "hiragana";
  // 0x30fc ー (長音符) and 0x30fb ・ live in this block and count as kana:
  // they are written the same way in a reading as in the headword.
  if (c >= 0x30a0 && c <= 0x30ff) return "katakana";
  return "other";
}

export const isKanji = (ch: string) => classify(ch) === "kanji";

/** True when the term contains no kanji, i.e. it already *is* its reading. */
export function isKanaOnly(term: string): boolean {
  return [...term].every((ch) => !isKanji(ch));
}

const KATAKANA_TO_HIRAGANA_OFFSET = 0x60;

/** Fold katakana to hiragana for comparison. ー and ・ pass through. */
export function toHiragana(input: string): string {
  return [...input]
    .map((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      if (c >= 0x30a1 && c <= 0x30f6) {
        return String.fromCodePoint(c - KATAKANA_TO_HIRAGANA_OFFSET);
      }
      return ch;
    })
    .join("");
}

/** Split a term into consecutive runs of the same class. */
export function runs(term: string): { text: string; kanji: boolean }[] {
  const out: { text: string; kanji: boolean }[] = [];
  for (const ch of term) {
    const kanji = isKanji(ch);
    const last = out[out.length - 1];
    if (last && last.kanji === kanji) last.text += ch;
    else out.push({ text: ch, kanji });
  }
  return out;
}

/**
 * A reading is well-formed when every character the term already spells in kana
 * survives verbatim, in order. Catches the whole family of damage this module
 * exists for: ー replaced by a vowel, katakana folded to hiragana, kana dropped.
 *
 * Says nothing about whether the *kanji* were read correctly — nothing derivable
 * from the two strings can.
 */
export function readingKeepsKana(term: string, reading: string): boolean {
  let i = 0;
  for (const ch of term) {
    if (isKanji(ch)) continue;
    const at = reading.indexOf(ch, i);
    if (at < 0) return false;
    i = at + 1;
  }
  return true;
}

/** Vowel a kana ends on, for resolving what a 長音符 was flattened into. */
const VOWEL_OF: Record<string, string> = {};
{
  const rows: [string, string][] = [
    ["あかがさざただなはばぱまやらわゃゕ", "あ"],
    ["いきぎしじちぢにひびぴみりゐぃ", "い"],
    ["うくぐすずつづぬふぶぷむゆるゅっぅ", "う"],
    ["えけげせぜてでねへべぺめれゑぇゖ", "え"],
    ["おこごそぞとどのほぼぽもよろをょぉ", "お"],
  ];
  for (const [chars, vowel] of rows) for (const c of chars) VOWEL_OF[c] = vowel;
}

/**
 * What a 長音符 may legitimately have been written as when someone flattened a
 * reading to hiragana: the preceding vowel, plus the standard う for お-row and
 * い for え-row (シャンプー → しゃんぷう, ケー → けい).
 */
function longVowelCandidates(prev: string): string[] {
  const v = VOWEL_OF[prev];
  if (!v) return [];
  if (v === "お") return ["お", "う"];
  if (v === "え") return ["え", "い"];
  return [v];
}

/**
 * Match a kana run of the headword against the old reading, tolerating exactly
 * the damage this repair exists to undo: a 長音符 rewritten as a vowel. Returns
 * how many characters of `folded` the run consumed, or -1.
 */
function consumeKanaRun(run: string, folded: string, start: number): number {
  let i = start;
  let prev = "";
  for (const ch of toHiragana(run)) {
    if (i >= folded.length) return -1;
    if (ch === "ー") {
      if (folded[i] === "ー") {
        i++;
      } else if (longVowelCandidates(prev).includes(folded[i])) {
        i++;
      } else {
        return -1;
      }
      continue;
    }
    if (folded[i] !== ch) return -1;
    prev = ch;
    i++;
  }
  return i - start;
}

/**
 * Rebuild a reading that was generated as all-hiragana so its kana runs read the
 * way the headword writes them, keeping whatever the old reading said for the
 * kanji.
 *
 * 掃除ブラシ + そうじぶらし → そうじブラシ   (kanji reading kept, katakana restored)
 * バスマット + ばすまっと   → バスマット     (no kanji at all)
 *
 * Returns null when the old reading cannot be aligned to the term — better to
 * report a row than to write a guess over it.
 */
export function restoreKanaRuns(term: string, oldReading: string): string | null {
  if (isKanaOnly(term)) return term;

  const parts = runs(term);
  const folded = toHiragana(oldReading);
  let cursor = 0;
  let out = "";

  for (let idx = 0; idx < parts.length; idx++) {
    const part = parts[idx];
    if (part.kanji) {
      const next = parts[idx + 1];
      if (!next) {
        // Trailing kanji run: whatever is left is its reading.
        out += oldReading.slice(cursor);
        cursor = oldReading.length;
        continue;
      }
      // The following kana run anchors where this kanji's reading ends. Scan
      // for the first position the run actually matches from — indexOf is no
      // use once ー may have been rewritten.
      let at = -1;
      for (let p = cursor; p <= folded.length; p++) {
        if (consumeKanaRun(next.text, folded, p) >= 0) {
          at = p;
          break;
        }
      }
      if (at < 0) return null;
      out += oldReading.slice(cursor, at);
      cursor = at;
    } else {
      const used = consumeKanaRun(part.text, folded, cursor);
      if (used < 0) return null;
      out += part.text; // the headword's own kana, katakana and ー intact
      cursor += used;
    }
  }

  if (cursor !== oldReading.length) return null;
  return out;
}
