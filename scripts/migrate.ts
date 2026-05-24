// Idempotent: creates tables if missing, seeds the words table if empty,
// generates cards. Targets Supabase Postgres (or any standard Postgres URL
// in DATABASE_URL). Runs at build time via the `vercel-build` script.
//
//   npx tsx scripts/migrate.ts
//
// Skips gracefully if DATABASE_URL is not set (e.g. local dev without DB).

import postgres from "postgres";
import { words as seedWords } from "../lib/words";

const DDL = [
  // ---- Word dictionary (public read; admin-only write via service role) ----
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

  // ---- User profile (display data; auth lives in auth.users) ----
  // Supabase auth.users(id) is UUID. We mirror display fields here for joins
  // and for RLS predicates that need username etc.
  `CREATE TABLE IF NOT EXISTS profiles (
     id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
     username    TEXT NOT NULL UNIQUE,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS profiles_username_lc_idx ON profiles(lower(username))`,

  // Auto-create a profile when a Supabase auth user signs up.
  `CREATE OR REPLACE FUNCTION public.handle_new_user()
   RETURNS TRIGGER
   LANGUAGE plpgsql
   SECURITY DEFINER SET search_path = public
   AS $$
   DECLARE
     base TEXT := COALESCE(
       NEW.raw_user_meta_data->>'username',
       split_part(NEW.email, '@', 1)
     );
     candidate TEXT := regexp_replace(lower(base), '[^a-z0-9_.-]', '', 'g');
     i INT := 0;
   BEGIN
     IF candidate = '' THEN candidate := 'user'; END IF;
     -- Find a free username by appending -2, -3, ...
     WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = candidate) LOOP
       i := i + 1;
       candidate := regexp_replace(lower(base), '[^a-z0-9_.-]', '', 'g') || '-' || (i + 1);
     END LOOP;
     INSERT INTO public.profiles (id, username) VALUES (NEW.id, candidate);
     RETURN NEW;
   END;
   $$`,
  `DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users`,
  `CREATE TRIGGER on_auth_user_created
     AFTER INSERT ON auth.users
     FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()`,

  // ---- Per-user data: UUID user_id → auth.users ----
  `CREATE TABLE IF NOT EXISTS user_favorites (
     user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     word_id    TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, word_id)
   )`,
  `CREATE TABLE IF NOT EXISTS user_learned (
     user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     word_id    TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     learned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, word_id)
   )`,
  `CREATE TABLE IF NOT EXISTS user_quiz_results (
     id         BIGSERIAL PRIMARY KEY,
     user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     quiz_type  TEXT NOT NULL,
     total      INT  NOT NULL,
     correct    INT  NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS user_quiz_user_idx ON user_quiz_results(user_id, created_at DESC)`,

  // ---- SRS cards (public read) + user_cards (per-user) ----
  `CREATE TABLE IF NOT EXISTS cards (
     id          BIGSERIAL PRIMARY KEY,
     word_id     TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     card_type   TEXT NOT NULL,
     front       TEXT NOT NULL,
     back        TEXT NOT NULL,
     explanation TEXT,
     tags        TEXT[] NOT NULL DEFAULT '{}',
     deck_key    TEXT NOT NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (word_id, deck_key)
   )`,
  `CREATE INDEX IF NOT EXISTS cards_word_idx ON cards(word_id)`,
  `CREATE INDEX IF NOT EXISTS cards_type_idx ON cards(card_type)`,

  `CREATE TABLE IF NOT EXISTS user_cards (
     user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

  `CREATE TABLE IF NOT EXISTS user_words (
     user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     word_id          TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     mastery          NUMERIC(5,2) NOT NULL DEFAULT 0,
     last_reviewed_at TIMESTAMPTZ,
     review_count     INT NOT NULL DEFAULT 0,
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, word_id)
   )`,
  `CREATE INDEX IF NOT EXISTS user_words_mastery_idx ON user_words(user_id, mastery)`,

  // ---- RLS: per-user tables locked down ----
  `ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_favorites     ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_learned       ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_quiz_results  ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_cards         ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_words         ENABLE ROW LEVEL SECURITY`,

  `DROP POLICY IF EXISTS profiles_read ON profiles`,
  `CREATE POLICY profiles_read ON profiles FOR SELECT USING (true)`,
  `DROP POLICY IF EXISTS profiles_self_update ON profiles`,
  `CREATE POLICY profiles_self_update ON profiles
     FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id)`,

  ...["user_favorites", "user_learned", "user_quiz_results", "user_cards", "user_words"].flatMap(
    (t) => [
      `DROP POLICY IF EXISTS ${t}_own ON ${t}`,
      `CREATE POLICY ${t}_own ON ${t} FOR ALL
         USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`,
    ],
  ),

  // ---- Public-read tables: enable RLS but allow anonymous SELECT ----
  `ALTER TABLE words  ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE cards  ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE events ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS words_public_read ON words`,
  `CREATE POLICY words_public_read ON words FOR SELECT USING (true)`,
  `DROP POLICY IF EXISTS cards_public_read ON cards`,
  `CREATE POLICY cards_public_read ON cards FOR SELECT USING (true)`,
  `DROP POLICY IF EXISTS events_anon_insert ON events`,
  `CREATE POLICY events_anon_insert ON events FOR INSERT WITH CHECK (true)`,
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

  out.push({
    cardType: "回想卡",
    front: `「${w.chinese}」的英文是？`,
    back: w.word,
    explanation: `${w.word} ${w.pronunciation} — ${w.chinese}`,
    tags: [...tags, "中譯英"],
    deckKey: "recall-zh-en",
  });

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
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateCards(sql: any) {
  let inserted = 0;
  let skipped = 0;
  for (const w of seedWords) {
    for (const c of cardsForWord(w)) {
      const r = await sql`
        INSERT INTO cards (word_id, card_type, front, back, explanation, tags, deck_key)
        VALUES (${w.id}, ${c.cardType}, ${c.front}, ${c.back}, ${c.explanation}, ${c.tags}, ${c.deckKey})
        ON CONFLICT (word_id, deck_key) DO NOTHING
        RETURNING id
      `;
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
  const sql = postgres(url, {
    ssl: "require",
    prepare: false,
    max: 1,
  });

  try {
    for (const stmt of DDL) {
      await sql.unsafe(stmt);
    }
    console.log(`[migrate] DDL applied (${DDL.length} statements).`);

    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM words
    `;
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
      console.log(`[migrate] seed complete.`);
    } else {
      console.log(`[migrate] words table already has ${count} rows — skipping seed.`);
    }

    await generateCards(sql);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("[migrate] failed:", e);
  process.exit(1);
});
