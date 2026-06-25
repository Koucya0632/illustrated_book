// Backfill Japanese detail content without the Vercel AI Gateway.
//
// Uses Google's public translation endpoint for non-sensitive dictionary
// content, then UPSERTs:
//   - explanatory word_definitions(language='ja')
//   - missing word_example_translations(language='ja')
//   - the 12 zodiac terms/readings that predate the Japanese deck
//
// Existing Japanese terms/readings and example translations are preserved
// unless the corresponding content is missing. Definitions that merely equal
// the Japanese term are treated as legacy placeholders and replaced.
//
// Usage:
//   node --env-file=.env.local --import tsx scripts/backfill-ja-google.ts
//   node --env-file=.env.local --import tsx scripts/backfill-ja-google.ts --limit=20
//   node --env-file=.env.local --import tsx scripts/backfill-ja-google.ts --refresh

import { getSql } from "../lib/db";

const GOOGLE_TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single";
const TARGET_LANGUAGE = "ja";

const ZODIAC_TERMS: Record<string, { term: string; reading: string }> = {
  aquarius: { term: "水瓶座", reading: "みずがめざ" },
  aries: { term: "牡羊座", reading: "おひつじざ" },
  cancer: { term: "蟹座", reading: "かにざ" },
  capricorn: { term: "山羊座", reading: "やぎざ" },
  gemini: { term: "双子座", reading: "ふたござ" },
  leo: { term: "獅子座", reading: "ししざ" },
  libra: { term: "天秤座", reading: "てんびんざ" },
  pisces: { term: "魚座", reading: "うおざ" },
  sagittarius: { term: "射手座", reading: "いてざ" },
  scorpio: { term: "蠍座", reading: "さそりざ" },
  taurus: { term: "牡牛座", reading: "おうしざ" },
  virgo: { term: "乙女座", reading: "おとめざ" },
};

interface WordRow {
  id: string;
  chinese_definition: string | null;
  chinese_term: string | null;
  japanese_term: string | null;
  japanese_reading: string | null;
  japanese_definition: string | null;
}

interface ExampleRow {
  id: number;
  word_id: string;
  chinese: string | null;
}

function argNumber(name: string): number | undefined {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

async function translateZhToJa(text: string): Promise<string> {
  const params = new URLSearchParams({
    client: "gtx",
    sl: "zh-TW",
    tl: TARGET_LANGUAGE,
    dt: "t",
    q: text,
  });
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(`${GOOGLE_TRANSLATE_URL}?${params}`, {
        headers: { "User-Agent": "TujiDictionaryBackfill/1.0" },
      });
      if (!response.ok) throw new Error(`Google Translate HTTP ${response.status}`);
      const body = (await response.json()) as unknown;
      if (!Array.isArray(body) || !Array.isArray(body[0])) {
        throw new Error("Unexpected Google Translate response");
      }
      const translated = body[0]
        .map((segment: unknown) =>
          Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : "",
        )
        .join("")
        .trim();
      if (!translated) throw new Error("Empty Google Translate result");
      return translated;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}

async function main() {
  const sql = getSql();
  if (!sql) {
    console.error("[ja-google] DATABASE_URL not set");
    process.exitCode = 1;
    return;
  }
  const limit = argNumber("limit");
  const refresh = process.argv.includes("--refresh");

  const words = (await sql`
    SELECT
      w.id,
      w.chinese_definition,
      (SELECT definition
       FROM word_definitions
       WHERE word_id = w.id AND language = 'zh'
       ORDER BY sort_order
       LIMIT 1) AS chinese_term,
      wt.term AS japanese_term,
      wt.reading AS japanese_reading,
      (SELECT definition
       FROM word_definitions
       WHERE word_id = w.id AND language = 'ja'
       ORDER BY sort_order
       LIMIT 1) AS japanese_definition
    FROM words w
    LEFT JOIN word_terms wt
      ON wt.word_id = w.id AND wt.language = 'ja'
    WHERE w.status = 'published' AND w.deleted_at IS NULL
    ORDER BY w.category, w.word
  `) as unknown as WordRow[];

  const pendingWords = words.filter((word) => {
      const zodiac = ZODIAC_TERMS[word.id];
      const term = word.japanese_term?.trim() || zodiac?.term;
      const definition = word.japanese_definition?.trim();
      return Boolean(
        refresh ||
          zodiac ||
          (term &&
            (!definition || definition === term) &&
          (word.chinese_definition?.trim() || word.chinese_term?.trim())),
      );
    });
  const selectedWords = limit ? pendingWords.slice(0, limit) : pendingWords;

  console.log(`[ja-google] translating ${selectedWords.length} definition(s).`);
  const translatedDefinitions = await mapConcurrent(selectedWords, 5, async (word) => {
    const zodiac = ZODIAC_TERMS[word.id];
    const term = word.japanese_term?.trim() || zodiac?.term;
    const chineseTerm = word.chinese_term?.trim();
    const source = word.chinese_definition?.trim() || chineseTerm;
    if (!term || !source || !chineseTerm) {
      throw new Error(`${word.id}: missing term or Chinese definition`);
    }
    // Quoting the Chinese headword gives the machine translator enough
    // dictionary context to avoid literal polysemy mistakes (e.g. 浴鹽's
    // 調料 becoming "spice"). Replace its translated quote with our curated
    // Japanese term so the explanation always agrees with the deck answer.
    const translated = await translateZhToJa(`「${chineseTerm}」是${source}`);
    const definition = translated.replace(/^「[^」]+」/, `「${term}」`);
    if (definition === term) {
      throw new Error(`${word.id}: translated definition still equals term`);
    }
    console.log(`  ✓ ${word.id}: ${term} — ${definition}`);
    return { word, term, reading: word.japanese_reading?.trim() || zodiac?.reading, definition };
  });

  for (const item of translatedDefinitions) {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO word_terms (word_id, language, term, reading, pronunciation)
        VALUES (
          ${item.word.id},
          'ja',
          ${item.term},
          ${item.reading ?? null},
          ${item.reading ?? null}
        )
        ON CONFLICT (word_id, language) DO UPDATE SET
          term = EXCLUDED.term,
          reading = COALESCE(EXCLUDED.reading, word_terms.reading),
          pronunciation = COALESCE(EXCLUDED.pronunciation, word_terms.pronunciation),
          updated_at = now()
      `;
      await tx`
        INSERT INTO word_definitions (word_id, language, definition, sort_order)
        VALUES (${item.word.id}, 'ja', ${item.definition}, 0)
        ON CONFLICT (word_id, language, sort_order) DO UPDATE SET
          definition = EXCLUDED.definition,
          updated_at = now()
      `;
      await tx`
        INSERT INTO cards (word_id, card_type, front, back, explanation, tags, deck_key)
        VALUES (
          ${item.word.id},
          '回想卡',
          '',
          ${item.term},
          ${item.reading ? `${item.term} ${item.reading}` : item.term},
          ARRAY['image','ja']::text[],
          'image-ja'
        )
        ON CONFLICT (word_id, deck_key) DO UPDATE SET
          back = EXCLUDED.back,
          explanation = EXCLUDED.explanation,
          tags = EXCLUDED.tags
      `;
    });
  }

  const missingExamples = (await sql`
    SELECT e.id::int, e.word_id,
      (SELECT translation
       FROM word_example_translations
       WHERE example_id = e.id AND language = 'zh') AS chinese
    FROM word_examples e
    JOIN words w ON w.id = e.word_id
    JOIN word_terms wt ON wt.word_id = w.id AND wt.language = 'ja'
    WHERE w.status = 'published'
      AND w.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM word_example_translations t
        WHERE t.example_id = e.id AND t.language = 'ja'
      )
    ORDER BY w.category, w.word, e.sort_order
  `) as unknown as ExampleRow[];

  const selectedExamples = limit ? missingExamples.slice(0, limit) : missingExamples;
  console.log(`[ja-google] translating ${selectedExamples.length} missing example(s).`);
  const translatedExamples = await mapConcurrent(selectedExamples, 5, async (example) => {
    if (!example.chinese?.trim()) throw new Error(`${example.word_id}: missing Chinese example`);
    const translation = await translateZhToJa(example.chinese);
    console.log(`  ✓ ${example.word_id} example ${example.id}: ${translation}`);
    return { ...example, translation };
  });

  for (const example of translatedExamples) {
    await sql`
      INSERT INTO word_example_translations (example_id, language, translation)
      VALUES (${example.id}, 'ja', ${example.translation})
      ON CONFLICT (example_id, language) DO UPDATE SET
        translation = EXCLUDED.translation
    `;
  }

  console.log(
    `[ja-google] done: definitions=${translatedDefinitions.length}, ` +
      `examples=${translatedExamples.length}.`,
  );
  await sql.end({ timeout: 5 });
}

main().catch((error) => {
  console.error("[ja-google] fatal:", error);
  process.exit(1);
});
