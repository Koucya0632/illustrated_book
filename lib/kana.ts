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

// ---------------------------------------------------------------------------
// Furigana segmentation: which kana belong to which kanji.
//
// `reading` is one string for the whole headword, so it cannot say that 歯 is
// は and 磨 is みが. That split is a separate fact, and no rule derives it from
// the two strings — it needs a dictionary. What the strings *do* provide is a
// hard constraint on any proposed split: the pieces must concatenate back to
// exactly the reading we already hold. That constraint is the whole reason a
// dictionary beats asking a model, which can only ever propose.
// ---------------------------------------------------------------------------

/** One run of the headword and the kana read over it (`null` for bare kana). */
export type FuriganaSegment = { text: string; ruby: string | null };

/**
 * A dictionary entry in JmdictFurigana's own notation: `0:は;1:みが` indexes
 * into the surface, and a range (`0-1:とけい`) covers characters no rule can
 * split. Stored verbatim so the reference data and our copy stay comparable.
 */
export type FuriganaEntry = { reading: string; segments: string };

/** Surface form → every reading the dictionary holds for it. */
export type FuriganaDict = ReadonlyMap<string, readonly FuriganaEntry[]>;

/** Expand `0:は;1:みが` over `surface`, filling uncovered characters as bare kana. */
export function parseFuriganaEntry(surface: string, spec: string): FuriganaSegment[] {
  const covered = new Map<number, { end: number; ruby: string }>();
  for (const part of spec.split(";")) {
    const [range, ruby] = part.split(":");
    if (ruby === undefined) continue;
    const [start, end] = range.includes("-")
      ? range.split("-").map((n) => Number(n))
      : [Number(range), Number(range)];
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
    covered.set(start, { end, ruby });
  }
  const out: FuriganaSegment[] = [];
  const chars = [...surface];
  let i = 0;
  while (i < chars.length) {
    const hit = covered.get(i);
    if (hit && hit.end >= i && hit.end < chars.length) {
      out.push({ text: chars.slice(i, hit.end + 1).join(""), ruby: hit.ruby });
      i = hit.end + 1;
    } else {
      out.push({ text: chars[i], ruby: null });
      i += 1;
    }
  }
  return out;
}

const VOICED: Record<string, string> = {
  か: "が", き: "ぎ", く: "ぐ", け: "げ", こ: "ご",
  さ: "ざ", し: "じ", す: "ず", せ: "ぜ", そ: "ぞ",
  た: "だ", ち: "ぢ", つ: "づ", て: "で", と: "ど",
  は: "ば", ひ: "び", ふ: "ぶ", へ: "べ", ほ: "ぼ",
};
const HALF_VOICED: Record<string, string> = {
  は: "ぱ", ひ: "ぴ", ふ: "ぷ", へ: "ぺ", ほ: "ぽ",
};

/**
 * How a sub-word's dictionary reading may legitimately be written when it sits
 * inside a compound: 連濁 voices its first kana (袋 ふくろ → ゴミ袋 …ぶくろ), and
 * a final つ/く geminates before the next element (食 しょく → 食器 しょっ…).
 *
 * Both keep the length, which is what lets `retime` locate the change.
 */
function compoundVariants(reading: string): string[] {
  const out = [reading];
  const first = reading[0];
  if (first && VOICED[first]) out.push(VOICED[first] + reading.slice(1));
  if (first && HALF_VOICED[first]) out.push(HALF_VOICED[first] + reading.slice(1));
  if (reading.endsWith("つ") || reading.endsWith("く")) {
    out.push(reading.slice(0, -1) + "っ");
  }
  return out;
}

/**
 * Move a one-character variation into whichever segment owns it.
 *
 * Returns null when the changed character lands on kana the headword spells
 * itself — the headword is fixed, so a split that would rewrite it is wrong,
 * and the caller should try a different decomposition instead.
 */
function retime(
  segments: FuriganaSegment[],
  dictReading: string,
  actual: string
): FuriganaSegment[] | null {
  if (dictReading === actual) return segments;
  if (dictReading.length !== actual.length) return null;
  const differing: number[] = [];
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== dictReading[i]) differing.push(i);
  }
  if (differing.length !== 1) return null;
  const at = differing[0];

  const out: FuriganaSegment[] = [];
  let pos = 0;
  for (const seg of segments) {
    const spelled = seg.ruby ?? seg.text;
    const start = pos;
    pos += spelled.length;
    if (at < start || at >= pos) {
      out.push(seg);
      continue;
    }
    if (seg.ruby === null) return null;
    const k = at - start;
    out.push({ text: seg.text, ruby: seg.ruby.slice(0, k) + actual[at] + seg.ruby.slice(k + 1) });
  }
  return out;
}

/** Longest-first so 洗面台 wins over 洗, and a compound is not split more than it must be. */
function dictionarySplit(
  term: string,
  reading: string,
  dict: FuriganaDict
): FuriganaSegment[] | null {
  const chars = [...term];

  const walk = (i: number, pos: number): FuriganaSegment[] | null => {
    if (i === chars.length) return pos === reading.length ? [] : null;

    // A character the headword already spells in kana reads as itself.
    if (!isKanji(chars[i]) && reading.startsWith(chars[i], pos)) {
      const rest = walk(i + 1, pos + chars[i].length);
      if (rest) return [{ text: chars[i], ruby: null }, ...rest];
    }

    for (let j = chars.length; j > i; j--) {
      const sub = chars.slice(i, j).join("");
      const entries = dict.get(sub);
      if (!entries) continue;
      for (const entry of entries) {
        for (const variant of compoundVariants(entry.reading)) {
          if (!reading.startsWith(variant, pos)) continue;
          const parsed = retime(parseFuriganaEntry(sub, entry.segments), entry.reading, variant);
          if (!parsed) continue;
          const rest = walk(j, pos + variant.length);
          if (rest) return [...parsed, ...rest];
        }
      }
    }
    return null;
  };

  return walk(0, 0);
}

/**
 * Anchor each kanji run against the kana run that follows it. Needs no
 * dictionary, so it still answers for a word nothing holds — but it can only
 * ever say "these kana belong to this run of kanji", never which kanji.
 */
function runSplit(term: string, reading: string): FuriganaSegment[] | null {
  const parts = runs(term);
  const out: FuriganaSegment[] = [];
  let cursor = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.kanji) {
      if (!reading.startsWith(part.text, cursor)) return null;
      out.push({ text: part.text, ruby: null });
      cursor += part.text.length;
      continue;
    }
    const next = parts[i + 1];
    if (!next) {
      out.push({ text: part.text, ruby: reading.slice(cursor) });
      cursor = reading.length;
      continue;
    }
    const at = reading.indexOf(next.text, cursor);
    if (at < 0) return null;
    out.push({ text: part.text, ruby: reading.slice(cursor, at) });
    cursor = at;
  }

  if (cursor !== reading.length) return null;
  return out.every((s) => s.ruby !== "") ? out : null;
}

/**
 * Split a headword and its reading into ruby segments, as finely as the
 * evidence allows.
 *
 * Degrades one segment at a time rather than all-or-nothing: 目覚まし時計 gets
 * 目→め and 覚→ざ per character and 時計→とけい as one block, because 熟字訓
 * genuinely cannot be split further. JmdictFurigana itself emits such blocks,
 * so "one range, one ruby" is the format — per-character is the case where the
 * range happens to be one character long.
 *
 * Returns null when the headword has no kanji (nothing to annotate) or when
 * even run-level anchoring fails, which is the caller's signal to fall back to
 * printing the reading as its own line.
 */
export function segmentFurigana(
  term: string,
  reading: string,
  dict: FuriganaDict
): FuriganaSegment[] | null {
  if (!term || !reading || isKanaOnly(term)) return null;
  return dictionarySplit(term, reading, dict) ?? runSplit(term, reading);
}
