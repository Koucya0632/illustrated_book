// Idempotent: creates tables if missing, seeds the words table if empty.
// Runs at build time on Vercel via the `vercel-build` script in package.json.
//
//   npx tsx scripts/migrate.ts
//
// Skips gracefully if DATABASE_URL is not set (e.g. local dev without DB).

import { neon } from "@neondatabase/serverless";
import { words as seedWords } from "../lib/words";

const DDL = [
  `CREATE TABLE IF NOT EXISTS words (
     id              TEXT PRIMARY KEY,
     word            TEXT NOT NULL,
     also_known_as   TEXT[] NOT NULL DEFAULT '{}',
     chinese         TEXT NOT NULL,
     category        TEXT NOT NULL,
     part_of_speech  TEXT NOT NULL,
     pronunciation   TEXT NOT NULL,
     image_url       TEXT NOT NULL,
     collocations    TEXT[] NOT NULL DEFAULT '{}',
     examples        JSONB NOT NULL DEFAULT '[]'::jsonb,
     related_words   TEXT[] NOT NULL DEFAULT '{}',
     confusing_words JSONB NOT NULL DEFAULT '[]'::jsonb,
     note            TEXT,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS words_category_idx ON words(category)`,
  `CREATE INDEX IF NOT EXISTS words_word_idx ON words(lower(word))`,

  `CREATE TABLE IF NOT EXISTS events (
     id          BIGSERIAL PRIMARY KEY,
     type        TEXT NOT NULL,
     word_id     TEXT,
     category    TEXT,
     quiz_type   TEXT,
     correct     BOOLEAN,
     session_id  TEXT,
     ip_hash     TEXT,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS events_type_idx ON events(type)`,
  `CREATE INDEX IF NOT EXISTS events_word_idx ON events(word_id)`,
  `CREATE INDEX IF NOT EXISTS events_created_idx ON events(created_at DESC)`,

  // ---- Users & per-user data ----
  `CREATE TABLE IF NOT EXISTS users (
     id            BIGSERIAL PRIMARY KEY,
     username      TEXT NOT NULL UNIQUE,
     email         TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS users_email_lc_idx ON users(lower(email))`,
  `CREATE INDEX IF NOT EXISTS users_username_lc_idx ON users(lower(username))`,

  `CREATE TABLE IF NOT EXISTS user_favorites (
     user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     word_id    TEXT   NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, word_id)
   )`,

  `CREATE TABLE IF NOT EXISTS user_learned (
     user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     word_id    TEXT   NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     learned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, word_id)
   )`,

  `CREATE TABLE IF NOT EXISTS user_quiz_results (
     id         BIGSERIAL PRIMARY KEY,
     user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     quiz_type  TEXT NOT NULL,
     total      INT  NOT NULL,
     correct    INT  NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS user_quiz_user_idx ON user_quiz_results(user_id, created_at DESC)`,

  // ---- OAuth (Google) ----
  // password_hash becomes nullable so OAuth-only accounts can exist.
  `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE`,
  `CREATE INDEX IF NOT EXISTS users_google_sub_idx ON users(google_sub)`,

  // ---- Spaced-repetition (SRS) ----
  // cards: globally-shared content derived from words. Multiple cards per word.
  `CREATE TABLE IF NOT EXISTS cards (
     id          BIGSERIAL PRIMARY KEY,
     word_id     TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     card_type   TEXT NOT NULL,
     front       TEXT NOT NULL,
     back        TEXT NOT NULL,
     explanation TEXT,
     tags        TEXT[] NOT NULL DEFAULT '{}',
     deck_key    TEXT NOT NULL,    -- deterministic dedup key for re-running the generator
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (word_id, deck_key)
   )`,
  `CREATE INDEX IF NOT EXISTS cards_word_idx ON cards(word_id)`,
  `CREATE INDEX IF NOT EXISTS cards_type_idx ON cards(card_type)`,

  // user_cards: per-user SRS state for a card.
  `CREATE TABLE IF NOT EXISTS user_cards (
     user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     card_id           BIGINT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
     status            TEXT NOT NULL DEFAULT '新卡',
     interval_days     NUMERIC(10,4) NOT NULL DEFAULT 0,
     next_review_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
     review_count      INT NOT NULL DEFAULT 0,
     mistake_count     INT NOT NULL DEFAULT 0,
     last_rating       TEXT,
     last_reviewed_at  TIMESTAMPTZ,
     updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, card_id)
   )`,
  `CREATE INDEX IF NOT EXISTS user_cards_due_idx ON user_cards(user_id, next_review_at)`,

  // ---- One-off cleanups (idempotent) ----
  // Discontinued card types — 長文字答案、無法做 MCQ。FK cascade 會一起
  // 清掉 user_cards 的相關紀錄。
  `DELETE FROM cards WHERE card_type IN ('區分卡', '概念卡')`,
];

// ---- card generator ----

interface SeedCard {
  cardType: string;
  front: string;
  back: string;
  explanation: string;
  tags: string[];
  deckKey: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cardsForWord(w: (typeof seedWords)[number]): SeedCard[] {
  const out: SeedCard[] = [];
  const tags = [w.category, w.partOfSpeech];

  // 1. 回想卡: 中 → 英
  out.push({
    cardType: "回想卡",
    front: `「${w.chinese}」的英文是？`,
    back: w.word,
    explanation: `${w.word} ${w.pronunciation} — ${w.chinese}`,
    tags: [...tags, "中譯英"],
    deckKey: "recall-zh-en",
  });

  // 2. 回想卡: 英 → 中
  out.push({
    cardType: "回想卡",
    front: `「${w.word}」的中文意思是？`,
    back: w.chinese,
    explanation: w.alsoKnownAs?.length
      ? `也可寫成 ${w.alsoKnownAs.join(" / ")}。`
      : w.note ?? `${w.pronunciation}`,
    tags: [...tags, "英譯中"],
    deckKey: "recall-en-zh",
  });

  // 3. 填空卡: 從第一個例句挖掉目標單字
  const ex = w.examples.find((e) =>
    new RegExp(`\\b${escapeRegex(w.word)}\\b`, "i").test(e.en),
  );
  if (ex) {
    const blanked = ex.en.replace(
      new RegExp(`\\b${escapeRegex(w.word)}\\b`, "i"),
      "_____",
    );
    out.push({
      cardType: "填空卡",
      front: `填入正確單字：\n${blanked}\n（${ex.zh}）`,
      back: w.word,
      explanation: `完整句：${ex.en}`,
      tags: [...tags, "填空"],
      deckKey: "cloze-1",
    });
  }

  // 區分卡 / 概念卡 已停用 — 它們是長文字答案、無法做成多選題。
  // 改在 /word/[id] 詳情頁裡呈現該詞的混淆詞與註記。

  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateCards(sql: any) {
  let inserted = 0;
  let skipped = 0;
  for (const w of seedWords) {
    for (const c of cardsForWord(w)) {
      const r = (await sql`
        INSERT INTO cards (word_id, card_type, front, back, explanation, tags, deck_key)
        VALUES (${w.id}, ${c.cardType}, ${c.front}, ${c.back}, ${c.explanation}, ${c.tags}, ${c.deckKey})
        ON CONFLICT (word_id, deck_key) DO NOTHING
        RETURNING id
      `) as unknown as { id: number }[];
      if (r.length > 0) inserted++;
      else skipped++;
    }
  }
  console.log(`[migrate] cards: ${inserted} inserted, ${skipped} already existed`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[migrate] DATABASE_URL not set — skipping (local dev mode).");
    return;
  }
  const sql = neon(url);

  for (const stmt of DDL) {
    await sql.query(stmt);
  }
  console.log(`[migrate] DDL applied (${DDL.length} statements).`);

  const [{ count }] = (await sql`SELECT count(*)::int AS count FROM words`) as {
    count: number;
  }[];
  if (count === 0) {
    console.log(`[migrate] seeding ${seedWords.length} words...`);
    for (const w of seedWords) {
      await sql`
        INSERT INTO words (
          id, word, also_known_as, chinese, category, part_of_speech,
          pronunciation, image_url, collocations, examples,
          related_words, confusing_words, note
        ) VALUES (
          ${w.id}, ${w.word}, ${w.alsoKnownAs ?? []}, ${w.chinese}, ${w.category},
          ${w.partOfSpeech}, ${w.pronunciation}, ${w.imageUrl},
          ${w.collocations ?? []}, ${JSON.stringify(w.examples)}::jsonb,
          ${w.relatedWords ?? []}, ${JSON.stringify(w.confusingWords ?? [])}::jsonb,
          ${w.note ?? null}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }
    const [{ count: after }] = (await sql`SELECT count(*)::int AS count FROM words`) as {
      count: number;
    }[];
    console.log(`[migrate] seed complete. words=${after}`);
  } else {
    console.log(`[migrate] words table already has ${count} rows — skipping seed.`);
  }

  await generateCards(sql);
}

main().catch((e) => {
  console.error("[migrate] failed:", e);
  process.exit(1);
});
