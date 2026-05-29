// Idempotent: creates tables if missing, seeds the words table if empty,
// generates cards. Targets Supabase Postgres (or any standard Postgres URL
// in DATABASE_URL). Runs at build time via the `vercel-build` script.
//
//   npx tsx scripts/migrate.ts
//
// Skips gracefully if DATABASE_URL is not set (e.g. local dev without DB).

import postgres from "postgres";
import { categories as seedCategories } from "../lib/categories";
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
  // Additive: editable display name (non-unique; NULL falls back to username)
  // and selectable mascot-pose avatar.
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname TEXT`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar   TEXT NOT NULL DEFAULT 'face'`,

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
  // user_quiz_results removed — the quiz feature was deleted. Drop it on
  // existing deployments (idempotent; CASCADE clears its index + RLS policy).
  // No-op on a fresh database.
  `DROP TABLE IF EXISTS user_quiz_results CASCADE`,

  // Per-user app settings (one row per user; created lazily on first save).
  `CREATE TABLE IF NOT EXISTS user_settings (
     user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
     daily_goal INT  NOT NULL DEFAULT 12,
     accent     TEXT NOT NULL DEFAULT 'us',
     show_zh    BOOLEAN NOT NULL DEFAULT TRUE,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // Additive: study theme filter (idempotent for the already-created table).
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS study_category TEXT NOT NULL DEFAULT 'all'`,
  // Additive: interface language + font size.
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ui_lang   TEXT NOT NULL DEFAULT 'zh-Hant'`,
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS font_size TEXT NOT NULL DEFAULT 'md'`,
  // Additive: study deck filter (comma-joined deck_key list; '' = all decks).
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS study_decks TEXT NOT NULL DEFAULT ''`,

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
  `ALTER TABLE user_settings      ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_cards         ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_words         ENABLE ROW LEVEL SECURITY`,

  `DROP POLICY IF EXISTS profiles_read ON profiles`,
  `CREATE POLICY profiles_read ON profiles FOR SELECT USING (true)`,
  `DROP POLICY IF EXISTS profiles_self_update ON profiles`,
  `CREATE POLICY profiles_self_update ON profiles
     FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id)`,

  ...["user_favorites", "user_learned", "user_settings", "user_cards", "user_words"].flatMap(
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

  // =====================================================================
  // Schema v2 (additive only — Phase 1 of the words refactor)
  // - words.chinese / examples / related_words / confusing_words remain
  //   until application is fully migrated. Phase 3 drops them.
  // =====================================================================

  // ---- Words: new columns (audio, CEFR, soft delete, draft/archive) ----
  `ALTER TABLE words ADD COLUMN IF NOT EXISTS audio_url  TEXT`,
  `ALTER TABLE words ADD COLUMN IF NOT EXISTS cefr_level TEXT`,
  `ALTER TABLE words ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'published'`,
  `ALTER TABLE words ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  // ---- Images: self-hosted Storage + provenance (record-keeping) --------
  // image_url itself now holds a Supabase Storage public URL after backfill;
  // image_source_url records the original external URL (so we can re-fetch
  // if needed); image_license / image_credit are free-form audit columns
  // (currently not surfaced in UI, but stored so future legal review is
  // possible without re-deriving from each URL).
  `ALTER TABLE words ADD COLUMN IF NOT EXISTS image_source_url TEXT`,
  `ALTER TABLE words ADD COLUMN IF NOT EXISTS image_license    TEXT`,
  `ALTER TABLE words ADD COLUMN IF NOT EXISTS image_credit     TEXT`,
  // AI-enriched content: word etymology (詞源拆解) + inflected forms (詞形變化,
  // stored as JSONB [{label,value}]). Mnemonic reuses the existing `note`.
  `ALTER TABLE words ADD COLUMN IF NOT EXISTS etymology TEXT`,
  `ALTER TABLE words ADD COLUMN IF NOT EXISTS forms     JSONB NOT NULL DEFAULT '[]'::jsonb`,
  // CHECK constraints — wrapped so repeated migrate runs don't blow up.
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'words_cefr_chk') THEN
       ALTER TABLE words ADD CONSTRAINT words_cefr_chk
         CHECK (cefr_level IS NULL OR cefr_level IN ('A1','A2','B1','B2','C1','C2'));
     END IF;
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'words_status_chk') THEN
       ALTER TABLE words ADD CONSTRAINT words_status_chk
         CHECK (status IN ('draft','published','archived'));
     END IF;
   END $$`,

  // ---- categories: pull out the hardcoded enum into a reference table ----
  `CREATE TABLE IF NOT EXISTS categories (
     id          TEXT PRIMARY KEY,
     name        TEXT NOT NULL,
     name_zh     TEXT NOT NULL,
     emoji       TEXT NOT NULL,
     description TEXT,
     color       TEXT,
     image_url   TEXT,
     sort_order  INT NOT NULL DEFAULT 0,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // FK words.category → categories.id is added in backfillSchemaV2, after
  // seedCategoriesIntoDb has populated the table — adding it here would fail
  // because the categories table is empty when the DDL batch runs.

  // ---- tags: free-form labels (no hardcoded list) ----
  `CREATE TABLE IF NOT EXISTS tags (
     id         TEXT PRIMARY KEY,
     name       TEXT NOT NULL,
     emoji      TEXT,
     color      TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS word_tags (
     word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
     PRIMARY KEY (word_id, tag_id)
   )`,
  `CREATE INDEX IF NOT EXISTS word_tags_tag_idx ON word_tags(tag_id)`,

  // ---- word_definitions: multi-language meanings ----
  `CREATE TABLE IF NOT EXISTS word_definitions (
     id          BIGSERIAL PRIMARY KEY,
     word_id     TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     language    TEXT NOT NULL,
     definition  TEXT NOT NULL,
     cefr_level  TEXT,
     sort_order  INT NOT NULL DEFAULT 0,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (word_id, language, sort_order),
     CHECK (cefr_level IS NULL OR cefr_level IN ('A1','A2','B1','B2','C1','C2'))
   )`,
  `CREATE INDEX IF NOT EXISTS word_defs_word_lang_idx ON word_definitions(word_id, language)`,

  // ---- word_examples + translations ----
  `CREATE TABLE IF NOT EXISTS word_examples (
     id          BIGSERIAL PRIMARY KEY,
     word_id     TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     sentence    TEXT NOT NULL,
     cefr_level  TEXT,
     sort_order  INT NOT NULL DEFAULT 0,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     CHECK (cefr_level IS NULL OR cefr_level IN ('A1','A2','B1','B2','C1','C2'))
   )`,
  `CREATE INDEX IF NOT EXISTS word_examples_word_idx ON word_examples(word_id)`,
  `CREATE TABLE IF NOT EXISTS word_example_translations (
     example_id  BIGINT NOT NULL REFERENCES word_examples(id) ON DELETE CASCADE,
     language    TEXT NOT NULL,
     translation TEXT NOT NULL,
     PRIMARY KEY (example_id, language)
   )`,

  // ---- word_relations: typed graph (synonym / antonym / confusing / ...) ----
  // target_word_id is intentionally NOT a foreign key: legacy 'confusing'
  // notes (e.g. fridge → refrigerator) point at concept words that aren't in
  // the dictionary yet, and 'see-also' often references a category/topic.
  // Source side keeps CASCADE so cleanup on word delete is automatic. The
  // tgt index is still maintained for "what links here" queries.
  `CREATE TABLE IF NOT EXISTS word_relations (
     id             BIGSERIAL PRIMARY KEY,
     source_word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     target_word_id TEXT NOT NULL,
     relation_type  TEXT NOT NULL,
     note           TEXT,
     created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (source_word_id, target_word_id, relation_type),
     CHECK (source_word_id <> target_word_id),
     CHECK (relation_type IN ('synonym','antonym','hypernym','hyponym','confusing','see-also'))
   )`,
  // Drop the FK on existing deployments where the original strict schema
  // already created it. Idempotent.
  `DO $$ BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'word_relations'::regclass
         AND conname = 'word_relations_target_word_id_fkey'
     ) THEN
       ALTER TABLE word_relations DROP CONSTRAINT word_relations_target_word_id_fkey;
     END IF;
   END $$`,
  `CREATE INDEX IF NOT EXISTS word_rel_src_idx ON word_relations(source_word_id)`,
  `CREATE INDEX IF NOT EXISTS word_rel_tgt_idx ON word_relations(target_word_id)`,

  // ---- RLS on the new tables: public SELECT, writes via service role only ----
  `ALTER TABLE categories                ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE tags                      ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE word_tags                 ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE word_definitions          ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE word_examples             ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE word_example_translations ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE word_relations            ENABLE ROW LEVEL SECURITY`,
  ...[
    "categories",
    "tags",
    "word_tags",
    "word_definitions",
    "word_examples",
    "word_example_translations",
    "word_relations",
  ].flatMap((t) => [
    `DROP POLICY IF EXISTS ${t}_public_read ON ${t}`,
    `CREATE POLICY ${t}_public_read ON ${t} FOR SELECT USING (true)`,
  ]),

  // =====================================================================
  // Schema v3 (additive — new tables for multi-media, M:N categories,
  // append-only study history, plus trigram indexes for substring search).
  // Existing v2 tables (words, word_definitions, word_examples,
  // word_example_translations, user_words, user_cards) keep their shape.
  // Reads continue to flow through v2 until application code migrates.
  // =====================================================================

  // ---- Extensions ----
  // pg_trgm: ILIKE '%foo%' / CJK substring substring matching via GIN indexes.
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,

  // ---- word_media: one row per image / audio / AI-generated visual ----
  // Replaces the inline image_url + audio_url + image_source_url + image_license
  // + image_credit columns on `words`. A word can have multiple media of each
  // kind (e.g. classic photo + AI memory illustration + audio pronunciation);
  // is_primary picks the default per kind.
  `CREATE TABLE IF NOT EXISTS word_media (
     id           BIGSERIAL PRIMARY KEY,
     word_id      TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     kind         TEXT NOT NULL CHECK (kind IN ('image','audio','ai_memory','video')),
     url          TEXT NOT NULL,
     storage_path TEXT,
     mime_type    TEXT,
     width        INT,
     height       INT,
     duration_ms  INT,
     source_url   TEXT,
     license      TEXT,
     credit       TEXT,
     prompt       TEXT,
     model        TEXT,
     is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
     sort_order   INT NOT NULL DEFAULT 0,
     metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS word_media_word_sort_idx
     ON word_media(word_id, sort_order)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS word_media_primary_uniq
     ON word_media(word_id, kind) WHERE is_primary`,

  // ---- word_categories: M:N — a word can belong to multiple categories ----
  // Backfilled from words.category (single FK) with is_primary=true. Existing
  // FK on words.category stays for now; app reads still use it. New UIs can
  // start reading from word_categories without breaking anything.
  `CREATE TABLE IF NOT EXISTS word_categories (
     word_id     TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
     is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (word_id, category_id)
   )`,
  `CREATE INDEX IF NOT EXISTS word_categories_category_idx
     ON word_categories(category_id, word_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS word_categories_primary_uniq
     ON word_categories(word_id) WHERE is_primary`,

  // ---- study_logs: append-only history of every review event ----
  // Distinct from `events` (which is anonymous public traffic). study_logs is
  // per-user SRS / quiz history, includes the SRS snapshot so a future
  // analytics / Anki-export job can rebuild mastery from logs alone.
  `CREATE TABLE IF NOT EXISTS study_logs (
     id                BIGSERIAL PRIMARY KEY,
     user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     word_id           TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     activity          TEXT NOT NULL CHECK (activity IN
                         ('flashcard','mcq','typing','listening','image_recall','reading')),
     rating            SMALLINT NOT NULL CHECK (rating IN (0,1,2,3)),
     is_correct        BOOLEAN,
     response_ms       INT,
     interval_before   NUMERIC(10,4),
     interval_after    NUMERIC(10,4),
     ease_before       NUMERIC(5,3),
     ease_after        NUMERIC(5,3),
     mastery_before    NUMERIC(5,2),
     mastery_after     NUMERIC(5,2),
     client_session_id TEXT,
     metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS study_logs_user_created_idx
     ON study_logs(user_id, created_at DESC)`,

  // ---- Trigram indexes (substring + case-insensitive search) ----
  // The plan calls for these on `words.lemma` and `word_translations.translation`;
  // current schema names are `words.word` and `word_definitions.definition`.
  // Partial predicate on words matches lib/data.ts public read filter exactly,
  // so the index stays slim and draft/archived writes don't touch it.
  `CREATE INDEX IF NOT EXISTS words_word_trgm_idx
     ON words USING GIN (word gin_trgm_ops)
     WHERE deleted_at IS NULL AND status = 'published'`,
  `CREATE INDEX IF NOT EXISTS word_defs_text_trgm_idx
     ON word_definitions USING GIN (definition gin_trgm_ops)`,

  // ---- "Browse by language" — reverse-direction composite on word_definitions ----
  // Existing word_defs_word_lang_idx (word_id, language) serves "load all
  // definitions for one word". The reverse — "which words have a JP def" —
  // needs language-leading.
  `CREATE INDEX IF NOT EXISTS word_defs_lang_word_idx
     ON word_definitions(language, word_id)`,

  // ---- word_examples sort-order composite ----
  // FK alone doesn't auto-index. (word_id, sort_order) satisfies filter + sort
  // in one scan for the detail page.
  `CREATE INDEX IF NOT EXISTS word_examples_word_sort_idx
     ON word_examples(word_id, sort_order)`,

  // ---- RLS on the v3 tables ----
  `ALTER TABLE word_media       ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE word_categories  ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE study_logs       ENABLE ROW LEVEL SECURITY`,

  `DROP POLICY IF EXISTS word_media_public_read ON word_media`,
  `CREATE POLICY word_media_public_read ON word_media FOR SELECT USING (true)`,
  `DROP POLICY IF EXISTS word_categories_public_read ON word_categories`,
  `CREATE POLICY word_categories_public_read ON word_categories FOR SELECT USING (true)`,

  `DROP POLICY IF EXISTS study_logs_self_read ON study_logs`,
  `CREATE POLICY study_logs_self_read ON study_logs
     FOR SELECT USING (auth.uid() = user_id)`,
  `DROP POLICY IF EXISTS study_logs_self_insert ON study_logs`,
  `CREATE POLICY study_logs_self_insert ON study_logs
     FOR INSERT WITH CHECK (auth.uid() = user_id)`,

];

// ---- Phase 3: drop legacy `words` columns ----
// Runs AFTER backfillSchemaV2 completes — once backfill has copied any
// remaining legacy data into the v2 sub-tables, the columns are safe to
// remove. Idempotent so re-running migrate after the drop is a no-op.
const POST_BACKFILL_DROPS = [
  `ALTER TABLE words DROP COLUMN IF EXISTS chinese`,
  `ALTER TABLE words DROP COLUMN IF EXISTS examples`,
  `ALTER TABLE words DROP COLUMN IF EXISTS related_words`,
  `ALTER TABLE words DROP COLUMN IF EXISTS confusing_words`,
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

// ---- Schema v2 backfill ----
// Reads the legacy columns on `words` and projects them into the new
// normalized tables. Every statement is idempotent (ON CONFLICT DO NOTHING
// or skip-if-rows-exist), so re-running migrate is safe.
//
// Steps that read legacy columns (definitions / examples / relations) are
// short-circuited once those columns have been dropped (Phase 3+). The first
// run on a fresh post-drop database is still correct because data is already
// in the v2 sub-tables.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function legacyColumnsPresent(sql: any): Promise<boolean> {
  const [{ c }] = await sql`
    SELECT count(*)::int AS c
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'words'
      AND column_name = 'chinese'
  `;
  return c > 0;
}

// Seed the categories reference table from the static TS source
// (`lib/categories.ts`). Idempotent (ON CONFLICT DO NOTHING) and additive:
// adding a new category to that file just inserts one more row on the next
// deploy. MUST run before word seeding so words.category never references a
// category that isn't in the table yet (the words_category_fk would reject it).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedCategoriesIntoDb(sql: any) {
  for (const c of seedCategories) {
    await sql`
      INSERT INTO categories (id, name, name_zh, emoji, description, color, image_url, sort_order)
      VALUES (
        ${c.id}, ${c.name}, ${c.nameZh}, ${c.emoji},
        ${c.description}, ${c.color}, ${c.imageUrl},
        ${seedCategories.indexOf(c)}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
  const [{ c: catCount }] = await sql`SELECT count(*)::int AS c FROM categories`;
  console.log(`[migrate] categories: ${catCount} rows`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function backfillSchemaV2(sql: any) {
  // categories are already seeded (see seedCategoriesIntoDb in the main run);
  // now that the table has rows, attach the FK (idempotent).
  await sql.unsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'words_category_fk') THEN
        ALTER TABLE words ADD CONSTRAINT words_category_fk
          FOREIGN KEY (category) REFERENCES categories(id) ON DELETE RESTRICT;
      END IF;
    END $$
  `);

  const hasLegacy = await legacyColumnsPresent(sql);
  if (!hasLegacy) {
    console.log("[migrate] legacy columns dropped — skipping v2 backfill steps");
    return;
  }

  // 2. word_definitions — pull chinese into (lang='zh', sort_order=0)
  const defRes = await sql`
    INSERT INTO word_definitions (word_id, language, definition, sort_order)
    SELECT id, 'zh', chinese, 0 FROM words
    WHERE chinese IS NOT NULL AND chinese <> ''
    ON CONFLICT (word_id, language, sort_order) DO NOTHING
    RETURNING id
  `;
  console.log(`[migrate] word_definitions: ${defRes.length} new rows`);

  // 3. word_examples + translations — explode the JSONB array.
  //    Idempotency: only backfill words that have ZERO examples in the new
  //    table yet. Some legacy rows have `examples` stored as a JSONB *string*
  //    containing a serialized array (double-encoded); normalize both shapes
  //    in SQL so the JS side doesn't have to branch.
  const wordsNeedingExamples = await sql`
    SELECT id,
      CASE
        WHEN jsonb_typeof(examples) = 'array'  THEN examples
        WHEN jsonb_typeof(examples) = 'string' THEN (examples #>> '{}')::jsonb
        ELSE '[]'::jsonb
      END AS examples
    FROM words w
    WHERE examples IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM word_examples WHERE word_id = w.id)
  `;
  let exInserted = 0;
  for (const w of wordsNeedingExamples) {
    const examples = Array.isArray(w.examples) ? w.examples : JSON.parse(w.examples);
    if (!Array.isArray(examples) || examples.length === 0) continue;
    for (let i = 0; i < examples.length; i++) {
      const ex = examples[i] as { en: string; zh: string };
      if (!ex?.en) continue;
      const [{ id }] = await sql`
        INSERT INTO word_examples (word_id, sentence, sort_order)
        VALUES (${w.id}, ${ex.en}, ${i})
        RETURNING id
      `;
      if (ex.zh) {
        await sql`
          INSERT INTO word_example_translations (example_id, language, translation)
          VALUES (${id}, 'zh', ${ex.zh})
          ON CONFLICT (example_id, language) DO NOTHING
        `;
      }
      exInserted++;
    }
  }
  console.log(`[migrate] word_examples: ${exInserted} new rows`);

  // 4. word_relations — related_words → see-also, confusing_words → confusing.
  //    No FK on target now, so dangling targets (concept words like
  //    "refrigerator" or "kitchen" that aren't dictionary entries) survive.
  //    The display layer skips entries it can't resolve when rendering
  //    clickable links, but the note text still appears for confusing.
  const relSeeAlso = await sql`
    INSERT INTO word_relations (source_word_id, target_word_id, relation_type, note)
    SELECT w.id, t, 'see-also', NULL
    FROM words w, unnest(w.related_words) AS t
    WHERE t <> w.id
    ON CONFLICT (source_word_id, target_word_id, relation_type) DO NOTHING
    RETURNING id
  `;
  const relConfusing = await sql`
    WITH normalized AS (
      SELECT id,
        CASE
          WHEN jsonb_typeof(confusing_words) = 'array'  THEN confusing_words
          WHEN jsonb_typeof(confusing_words) = 'string' THEN (confusing_words #>> '{}')::jsonb
          ELSE '[]'::jsonb
        END AS items
      FROM words
    )
    INSERT INTO word_relations (source_word_id, target_word_id, relation_type, note)
    SELECT n.id, (c->>'word'), 'confusing', (c->>'note')
    FROM normalized n, jsonb_array_elements(n.items) AS c
    WHERE (c->>'word') <> n.id
    ON CONFLICT (source_word_id, target_word_id, relation_type) DO NOTHING
    RETURNING id
  `;
  console.log(
    `[migrate] word_relations: ${relSeeAlso.length} see-also, ${relConfusing.length} confusing`,
  );
}

// ---- Schema v3 backfill ----
// Copies inline image/audio columns on `words` into `word_media`, and the
// single-FK `words.category` into `word_categories` (M:N). Idempotent: every
// step is gated on the target rows being absent.
//
// Source columns on `words` are NOT dropped here — application reads still
// flow through them. A later phase can drop them after lib/data.ts switches
// to word_media as its read source.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function backfillSchemaV3(sql: any) {
  // 1. word_media — image rows from words.image_url + provenance columns.
  const imgRes = await sql`
    INSERT INTO word_media (word_id, kind, url, source_url, license, credit, is_primary, sort_order)
    SELECT w.id, 'image', w.image_url, w.image_source_url, w.image_license, w.image_credit, TRUE, 0
    FROM words w
    WHERE w.image_url IS NOT NULL
      AND w.image_url <> ''
      AND NOT EXISTS (
        SELECT 1 FROM word_media m WHERE m.word_id = w.id AND m.kind = 'image'
      )
    RETURNING id
  `;
  console.log(`[migrate v3] word_media (image): ${imgRes.length} new rows`);

  // 2. word_media — audio rows where audio_url is set.
  const audioRes = await sql`
    INSERT INTO word_media (word_id, kind, url, is_primary, sort_order)
    SELECT w.id, 'audio', w.audio_url, TRUE, 0
    FROM words w
    WHERE w.audio_url IS NOT NULL
      AND w.audio_url <> ''
      AND NOT EXISTS (
        SELECT 1 FROM word_media m WHERE m.word_id = w.id AND m.kind = 'audio'
      )
    RETURNING id
  `;
  console.log(`[migrate v3] word_media (audio): ${audioRes.length} new rows`);

  // 3. word_categories — every word's existing single category becomes a primary
  //    M:N row. Future UI can add additional non-primary category links.
  const wcRes = await sql`
    INSERT INTO word_categories (word_id, category_id, is_primary)
    SELECT w.id, w.category, TRUE
    FROM words w
    WHERE w.category IS NOT NULL
    ON CONFLICT (word_id, category_id) DO NOTHING
    RETURNING word_id
  `;
  console.log(`[migrate v3] word_categories: ${wcRes.length} new rows`);
}

// ---- Schema v3.1: convert study_logs to monthly RANGE partitioning ----
// Pre-emptive: study_logs is brand-new and has no application writer yet, so
// rebuilding it as a partitioned table is risk-free now (free lunch — gets
// expensive once real data lands). On subsequent runs this is a no-op via
// the pg_partitioned_table check.
//
// Maintenance (creating next month's partition, dropping aged-out ones) is
// handled by /api/cron/partman, scheduled in vercel.json.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setupStudyLogsPartitioning(sql: any) {
  // 1. Extension (Supabase has pg_partman in its allowlist; CREATE EXTENSION
  //    is idempotent). Schema-isolated so the extension's functions stay out
  //    of public.
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS partman`);
  await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman`);

  // 2. Already-partitioned? Skip. The pg_partitioned_table catalog entry only
  //    exists for tables created with PARTITION BY.
  const [{ partitioned }] = (await sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_partitioned_table pt
      JOIN pg_class c ON c.oid = pt.partrelid
      WHERE c.relnamespace = 'public'::regnamespace
        AND c.relname = 'study_logs'
    ) AS partitioned
  `) as unknown as { partitioned: boolean }[];

  if (partitioned) {
    console.log("[migrate v3.1] study_logs already partitioned — skipping");
    return;
  }

  // 3. Safety net: only proceed if the table is empty. If real data ever
  //    landed before this conversion ran, abort loudly so the operator can
  //    plan a proper backfill (CREATE TABLE ... LIKE + INSERT SELECT + swap).
  const [{ count }] = (await sql`
    SELECT count(*)::int AS count FROM study_logs
  `) as unknown as { count: number }[];
  if (count > 0) {
    console.warn(
      `[migrate v3.1] study_logs has ${count} rows — partition conversion would lose data. Aborting v3.1 (run a manual backfill).`,
    );
    return;
  }

  // 4. Rebuild. Partition key must be in every UNIQUE constraint, including
  //    PK — so the PK becomes composite (id, created_at). `id` is still a
  //    BIGSERIAL so callers don't notice. ON DELETE CASCADE on FKs preserved.
  await sql.unsafe(`DROP TABLE study_logs CASCADE`);
  await sql.unsafe(`
    CREATE TABLE study_logs (
      id                BIGSERIAL,
      user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      word_id           TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      activity          TEXT NOT NULL CHECK (activity IN
                          ('flashcard','mcq','typing','listening','image_recall','reading')),
      rating            SMALLINT NOT NULL CHECK (rating IN (0,1,2,3)),
      is_correct        BOOLEAN,
      response_ms       INT,
      interval_before   NUMERIC(10,4),
      interval_after    NUMERIC(10,4),
      ease_before       NUMERIC(5,3),
      ease_after        NUMERIC(5,3),
      mastery_before    NUMERIC(5,2),
      mastery_after     NUMERIC(5,2),
      client_session_id TEXT,
      metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at)
  `);

  // Partitioned indexes — PG 11+ propagates these to every child partition.
  await sql.unsafe(`
    CREATE INDEX study_logs_user_created_idx
      ON study_logs (user_id, created_at DESC)
  `);

  // RLS re-applied (DROP TABLE wiped the policies).
  await sql.unsafe(`ALTER TABLE study_logs ENABLE ROW LEVEL SECURITY`);
  await sql.unsafe(`
    CREATE POLICY study_logs_self_read ON study_logs
      FOR SELECT USING (auth.uid() = user_id)
  `);
  await sql.unsafe(`
    CREATE POLICY study_logs_self_insert ON study_logs
      FOR INSERT WITH CHECK (auth.uid() = user_id)
  `);

  // 5. Hand the parent to pg_partman. p_premake=3 keeps 3 future months
  //    pre-created so a worker can always insert without waiting on
  //    maintenance.
  await sql`
    SELECT partman.create_parent(
      p_parent_table := 'public.study_logs',
      p_control      := 'created_at',
      p_interval     := '1 month',
      p_premake      := 3
    )
  `;

  // 6. Retention — drop partitions older than 12 months. Set retention_keep_
  //    table=false so they're actually DROP'd, not detached. If you'd rather
  //    archive them, flip to true and have a separate cold-storage job pull
  //    detached children before they're cleaned up.
  await sql`
    UPDATE partman.part_config
    SET retention = '12 months',
        retention_keep_table = false
    WHERE parent_table = 'public.study_logs'
  `;

  console.log(
    "[migrate v3.1] study_logs converted to monthly partitions (premake=3, retention=12mo)",
  );
}

// Seeds the given words + all v2 sub-tables from the static seedWords list
// (already normalized to v2 shape by legacyToV2 in lib/words.ts). `list`
// defaults to every seed word (fresh DB); main() passes only the words missing
// from the DB so this is idempotent and re-runnable on every deploy. The
// example insert assumes the word has no existing examples — true for missing
// words — so don't call this with words already present.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedV2(sql: any, list: typeof seedWords = seedWords) {
  for (const w of list) {
    // words row (new columns only — no legacy after Phase 3 drop).
    await sql`
      INSERT INTO words (
        id, word, also_known_as, category, part_of_speech,
        pronunciation, image_url, status, collocations, note
      ) VALUES (
        ${w.id}, ${w.word}, ${w.alsoKnownAs ?? []}, ${w.category},
        ${w.partOfSpeech}, ${w.pronunciation}, ${w.imageUrl},
        'published', ${w.collocations ?? []}, ${w.note ?? null}
      )
      ON CONFLICT (id) DO NOTHING
    `;
    // definitions
    for (const d of w.definitions ?? []) {
      if (!d.definition) continue;
      await sql`
        INSERT INTO word_definitions (word_id, language, definition, sort_order)
        VALUES (${w.id}, ${d.language}, ${d.definition}, ${d.sortOrder})
        ON CONFLICT (word_id, language, sort_order) DO NOTHING
      `;
    }
    // examples + translations
    for (let i = 0; i < (w.examples ?? []).length; i++) {
      const ex = w.examples[i];
      if (!ex.en) continue;
      const [{ id: exId }] = await sql`
        INSERT INTO word_examples (word_id, sentence, sort_order)
        VALUES (${w.id}, ${ex.en}, ${ex.sortOrder ?? i})
        RETURNING id
      `;
      for (const [lang, text] of Object.entries(ex.translations ?? {})) {
        if (!text) continue;
        await sql`
          INSERT INTO word_example_translations (example_id, language, translation)
          VALUES (${exId}, ${lang}, ${text})
          ON CONFLICT (example_id, language) DO NOTHING
        `;
      }
    }
    // relations
    for (const r of w.relations ?? []) {
      if (!r.wordId || r.wordId === w.id) continue;
      await sql`
        INSERT INTO word_relations (source_word_id, target_word_id, relation_type, note)
        VALUES (${w.id}, ${r.wordId}, ${r.type}, ${r.note ?? null})
        ON CONFLICT (source_word_id, target_word_id, relation_type) DO NOTHING
      `;
    }
  }
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

    // Seed categories BEFORE words: words.category is FK-constrained to
    // categories.id, so any newly added category must exist first or word
    // seeding would fail on an existing DB where the FK is already attached.
    await seedCategoriesIntoDb(sql);

    // Seed only the words missing from the DB — idempotent, so newly added
    // seed entries (e.g. supplemental-words.json) get inserted on every deploy
    // instead of only on an empty DB. This also guarantees every seed word's
    // row exists before generateCards (which would otherwise FK-fail).
    const existingRows = await sql<{ id: string }[]>`SELECT id FROM words`;
    const have = new Set(existingRows.map((r) => r.id));
    const missing = seedWords.filter((w) => !have.has(w.id));
    if (missing.length === 0) {
      console.log(`[migrate] all ${seedWords.length} seed words present — nothing to seed.`);
    } else {
      console.log(`[migrate] seeding ${missing.length} missing word(s) of ${seedWords.length}...`);
      await seedV2(sql, missing);
      console.log(`[migrate] seed complete.`);
    }

    await generateCards(sql);
    await backfillSchemaV2(sql);
    await backfillSchemaV3(sql);
    await setupStudyLogsPartitioning(sql);

    // Final cleanup: drop the legacy columns now that everything reads from
    // the v2 sub-tables. Idempotent (DROP COLUMN IF EXISTS).
    for (const stmt of POST_BACKFILL_DROPS) {
      await sql.unsafe(stmt);
    }
    console.log(`[migrate] legacy columns ensured dropped.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("[migrate] failed:", e);
  process.exit(1);
});
