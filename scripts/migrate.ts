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
import { runAtlasTextModeration } from "../lib/atlas/moderation";
import { applyMainWordCorrections } from "../lib/main-word-corrections";

const DDL = [
  // ---- Word dictionary (public read; admin-only write via service role) ----
  `CREATE TABLE IF NOT EXISTS words (
     id              TEXT PRIMARY KEY,
     word            TEXT NOT NULL,
     also_known_as   TEXT[] NOT NULL DEFAULT '{}',
     -- Legacy column being phased out: seedV2 already inserts Chinese
     -- into word_definitions (lang='zh-Hant', sort_order=0), and the
     -- POST_BACKFILL_DROPS step at the end of main() removes this
     -- column. Leaving it NOT NULL caused fresh-DB seeding to fail
     -- because seedV2's INSERT no longer populates it. Existing DBs are
     -- unaffected (CREATE TABLE IF NOT EXISTS won't alter columns).
     chinese         TEXT,
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
  // and avatar. `face` is the one built-in default; other accepted values are
  // server-minted URLs in the user-avatars bucket.
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname TEXT`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar   TEXT NOT NULL DEFAULT 'face'`,
  // RETIRED consent gate. Kept for one rollback window; nothing reads it and
  // no current migration derives publication state from it.
  //
  // It existed because `username` and `nickname` were private fields the
  // community layer wanted to publish: a handle that defaulted to the email
  // local part, and a display name silently seeded from the Apple Sign-In full
  // name. Both of those causes are removed in this same migration — the handle
  // is now a machine-minted UID and the seeding is gone — so the gate has
  // nothing left to protect.
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS public_author_confirmed_at TIMESTAMPTZ`,
  // RETIRED rename cooldown. Same reason for keeping the column. The cooldown
  // throttled renames because they rewrite the byline on already-published
  // work; with an immutable UID anchoring every author page, changing a display
  // name no longer launders an identity.
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS public_identity_changed_at TIMESTAMPTZ`,
  // Public 簽名 — a short self-introduction shown on the author profile.
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT`,
  // The old picker offered several mascot poses. They now all collapse to the
  // single black-cat default; uploaded photo URLs remain untouched.
  `UPDATE profiles
      SET avatar = 'face'
    WHERE avatar IN ('peek', 'wave', 'cheer', 'sleep', 'think')`,

  // Auto-create a profile when a Supabase auth user signs up.
  //
  // The handle is a machine-minted UID — `TJ` + 8 digits — and is never derived
  // from anything the user supplied. Two earlier defaults are deliberately gone:
  // `split_part(email,'@',1)` put a piece of everyone's email address in a field
  // the community layer later wanted to publish, and honouring
  // `raw_user_meta_data->>'username'` let the registration form choose a handle
  // that is now supposed to be system-assigned and immutable.
  //
  // Registration creates only the immutable UID and default avatar. A nickname
  // is optional and can be written only through the moderated Profile-edit
  // module after authentication; auth metadata is never promoted implicitly.
  //
  // Collisions re-roll rather than append a suffix: `TJ00000042-2` would fail
  // the UID pattern every reader validates against. 10^8 addresses means the
  // loop effectively never runs twice at this scale.
  `CREATE OR REPLACE FUNCTION public.handle_new_user()
   RETURNS TRIGGER
   LANGUAGE plpgsql
   SECURITY DEFINER SET search_path = public
   AS $$
   DECLARE
     candidate TEXT := 'TJ' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
   BEGIN
     WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
       candidate := 'TJ' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
     END LOOP;
     INSERT INTO public.profiles (id, username)
     VALUES (NEW.id, candidate);
     -- Mirror the UID into user_metadata: that is where the iOS client reads it
     -- (SessionUser is built from the session, not from a profiles fetch), so a
     -- profiles-only write leaves every new account with no visible UID at all.
     -- Safe from recursion: this trigger is AFTER INSERT, so an UPDATE here
     -- cannot re-fire it.
     UPDATE auth.users
        SET raw_user_meta_data =
              coalesce(raw_user_meta_data, '{}'::jsonb)
              || jsonb_build_object('username', candidate)
      WHERE id = NEW.id;
     RETURN NEW;
   END;
   $$`,
  // Migrate every pre-UID handle. Self-limiting: a row that already matches the
  // pattern is skipped, so re-running the migration is a no-op.
  //
  // Safe to rewrite in bulk because a handle is never persisted anywhere but
  // this column — iOS reads it from each payload and there is no web author
  // page — so no external URL and no client cache points at the old value.
  //
  // Wrapped in DO rather than a plain UPDATE because each row needs its own
  // re-roll loop, and it still executes as one idempotent statement like the
  // rest of this array.
  `DO $$
   DECLARE
     r RECORD;
     candidate TEXT;
   BEGIN
     FOR r IN SELECT id FROM profiles WHERE username !~ '^TJ[0-9]{8}$' LOOP
       LOOP
         candidate := 'TJ' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
         EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE username = candidate);
       END LOOP;
       UPDATE profiles SET username = candidate WHERE id = r.id;
     END LOOP;
   END $$`,
  // Re-point the user_metadata mirror at the migrated UID.
  //
  // The iOS client reads the UID from the session's user_metadata, not from
  // profiles, so rewriting only profiles left signed-in users with a mirror
  // holding their PRE-migration handle — which resolves to a 404 author page —
  // and OAuth accounts with no `username` key at all, which the app renders as a
  // disabled 我的公開主頁 row. Two writers used to keep this in sync (the email
  // signup payload and the retired public-author route) and both are gone, so
  // the trigger above and this statement are now the only ones.
  //
  // Self-limiting: rows already matching are skipped.
  `UPDATE auth.users u
      SET raw_user_meta_data =
            coalesce(u.raw_user_meta_data, '{}'::jsonb)
            || jsonb_build_object('username', p.username)
     FROM profiles p
    WHERE p.id = u.id
      AND coalesce(u.raw_user_meta_data->>'username', '') <> p.username`,
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
  `ALTER TABLE user_learned
     ADD COLUMN IF NOT EXISTS target_language TEXT NOT NULL DEFAULT 'en'`,
  `DO $$ BEGIN
     IF EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'user_learned'::regclass
         AND conname = 'user_learned_pkey'
         AND pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id, word_id)'
     ) THEN
       ALTER TABLE user_learned DROP CONSTRAINT user_learned_pkey;
       ALTER TABLE user_learned
         ADD PRIMARY KEY (user_id, word_id, target_language);
     END IF;
   END $$`,
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
  // Retire the `ja` UI language: migrate existing users to 繁體中文. Learning
  // Japanese is unaffected (that's `learning_direction`, not `ui_lang`).
  // `normalizeSettings` also clamps it on read, but clean the column too so
  // any server-rendered path stays consistent.
  `UPDATE user_settings SET ui_lang = 'zh-Hant' WHERE ui_lang = 'ja'`,
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS font_size TEXT NOT NULL DEFAULT 'md'`,
  // Additive: study deck filter (comma-joined deck_key list; '' = all decks).
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS study_decks TEXT NOT NULL DEFAULT ''`,
  // Learning target is deliberately separate from ui_lang. Existing users
  // remain on the current Chinese→English experience after migration.
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS learning_direction TEXT NOT NULL DEFAULT 'zh-en'`,
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'user_settings_learning_direction_chk'
     ) THEN
       ALTER TABLE user_settings
         ADD CONSTRAINT user_settings_learning_direction_chk
         CHECK (learning_direction IN ('zh-en','zh-ja'));
     END IF;
   END $$`,
  // Additive: multi-theme study filter (comma-joined category id list; '' = no
  // theme picked). Replaces the single-value `study_category`, which we keep
  // for rollback safety. Backfill: rows that previously had a real id (not
  // 'all') copy that id into the new column; rows with 'all' stay empty (the
  // new gate is "pick at least one theme to study").
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS study_categories TEXT NOT NULL DEFAULT ''`,
  `UPDATE user_settings
      SET study_categories = study_category
    WHERE study_categories = '' AND study_category <> 'all'`,

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

  // user_cards.created_at — added later so existing rows backfill to
  // updated_at (their last real activity), not "now" of the deploy. The
  // 4-step ordering matters: add (no default) → backfill via UPDATE →
  // attach DEFAULT for future inserts → flip NOT NULL. Each step is
  // idempotent so re-running migrate after the column lands is a no-op.
  `ALTER TABLE user_cards ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ`,
  `UPDATE user_cards SET created_at = updated_at WHERE created_at IS NULL`,
  `ALTER TABLE user_cards ALTER COLUMN created_at SET DEFAULT now()`,
  `ALTER TABLE user_cards ALTER COLUMN created_at SET NOT NULL`,
  `CREATE INDEX IF NOT EXISTS user_cards_created_idx ON user_cards(user_id, created_at)`,

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
  `ALTER TABLE user_words
     ADD COLUMN IF NOT EXISTS target_language TEXT NOT NULL DEFAULT 'en'`,
  `DO $$ BEGIN
     IF EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'user_words'::regclass
         AND conname = 'user_words_pkey'
         AND pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id, word_id)'
     ) THEN
       ALTER TABLE user_words DROP CONSTRAINT user_words_pkey;
       ALTER TABLE user_words
         ADD PRIMARY KEY (user_id, word_id, target_language);
     END IF;
   END $$`,
  `CREATE INDEX IF NOT EXISTS user_words_language_mastery_idx
     ON user_words(user_id, target_language, mastery)`,

  // ---- APNs / FCM push tokens for daily-reminder fanout ----
  // One row per (user, device). iOS sends a fresh token whenever APNs
  // rotates it; the route upserts.
  `CREATE TABLE IF NOT EXISTS user_push_tokens (
     user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     device_id  TEXT NOT NULL,
     token      TEXT NOT NULL,
     platform   TEXT NOT NULL DEFAULT 'ios',
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, device_id)
   )`,
  `CREATE INDEX IF NOT EXISTS user_push_tokens_user_idx ON user_push_tokens(user_id)`,

  // ---- RLS: per-user tables locked down ----
  `ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_favorites     ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_learned       ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_settings      ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_cards         ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_words         ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_push_tokens   ENABLE ROW LEVEL SECURITY`,

  `DROP POLICY IF EXISTS profiles_read ON profiles`,
  `CREATE POLICY profiles_read ON profiles FOR SELECT USING (true)`,
  `DROP POLICY IF EXISTS profiles_self_update ON profiles`,
  `CREATE POLICY profiles_self_update ON profiles
     FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id)`,

  ...["user_favorites", "user_learned", "user_settings", "user_cards", "user_words", "user_push_tokens"].flatMap(
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
  `ALTER TABLE words ADD COLUMN IF NOT EXISTS chinese_definition TEXT`,
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

  // Target-language headwords. Definitions remain explanatory text; terms
  // are the actual answer shown/spoken by the learning flow.
  `CREATE TABLE IF NOT EXISTS word_terms (
     word_id       TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     language      TEXT NOT NULL,
     term          TEXT NOT NULL,
     reading       TEXT,
     pronunciation TEXT,
     audio_url     TEXT,
     updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (word_id, language)
   )`,
  `CREATE INDEX IF NOT EXISTS word_terms_language_word_idx
     ON word_terms(language, word_id)`,
  // Which kana sit over which characters of `term`. Derived from `reading`,
  // never a replacement for it: the 拼字 stage still quizzes the whole string.
  // NULL means "no trustworthy split", which is a display fallback, not an error.
  `ALTER TABLE word_terms ADD COLUMN IF NOT EXISTS reading_segments JSONB`,
  `ALTER TABLE word_terms ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS word_terms_public_read ON word_terms`,
  `CREATE POLICY word_terms_public_read ON word_terms FOR SELECT USING (true)`,

  // ---- Furigana reference dictionary (JmdictFurigana, CC BY-SA) ----
  // Reference data, not user data: loaded once by scripts/import-furigana-dict.ts
  // and read only through lib/furigana-dict.ts. It lives here rather than in the
  // bundle because splitting a headword probes every substring of it — one
  // `surface = ANY(...)` answers all of them, where a 12 MB file would be parsed
  // into memory again on every cold start of the enrich path.
  `CREATE TABLE IF NOT EXISTS furigana_dict (
     surface  TEXT NOT NULL,
     reading  TEXT NOT NULL,
     segments TEXT NOT NULL,
     PRIMARY KEY (surface, reading)
   )`,
  `CREATE INDEX IF NOT EXISTS furigana_dict_surface_idx ON furigana_dict(surface)`,
  // RLS on with no policy: nothing reaches this through the anon API surface.
  `ALTER TABLE furigana_dict ENABLE ROW LEVEL SECURITY`,

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
  // Per-locale pronunciation audio (en-US / en-GB / ja-JP). One audio row per
  // (word, locale); the partial unique index lets generate-audio.ts UPSERT
  // idempotently. NULL locale is allowed for non-audio kinds (images etc.).
  `ALTER TABLE word_media ADD COLUMN IF NOT EXISTS locale TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS word_media_audio_locale_uniq
     ON word_media(word_id, kind, locale) WHERE kind = 'audio'`,

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
  `ALTER TABLE study_logs
     ADD COLUMN IF NOT EXISTS target_language TEXT NOT NULL DEFAULT 'en'`,
  `CREATE INDEX IF NOT EXISTS study_logs_user_language_created_idx
     ON study_logs(user_id, target_language, created_at DESC)`,

  // ---- study_reports: user-submitted content / product issue reports ----
  // The question snapshot is intentionally stored with the report so admins
  // can still inspect what the learner saw after the source word is edited.
  `CREATE TABLE IF NOT EXISTS study_reports (
     id                BIGSERIAL PRIMARY KEY,
     request_id        UUID NOT NULL UNIQUE,
     user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     word_id           TEXT REFERENCES words(id) ON DELETE SET NULL,
     card_id           BIGINT REFERENCES cards(id) ON DELETE SET NULL,
     issue_type        TEXT NOT NULL CHECK (issue_type IN
                         ('image','content','audio','answer','ui','other')),
     description       TEXT NOT NULL CHECK (
                         char_length(btrim(description)) BETWEEN 1 AND 1000
                       ),
     mode              TEXT NOT NULL CHECK (mode IN ('new','review')),
     phase             TEXT NOT NULL,
     selected_answer   TEXT,
     platform          TEXT NOT NULL CHECK (platform IN ('web','ios')),
     app_version       TEXT,
     ui_lang           TEXT NOT NULL,
     snapshot          JSONB NOT NULL DEFAULT '{}'::jsonb,
     status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
                         ('pending','reviewing','resolved','rejected','duplicate')),
     internal_note     TEXT,
     duplicate_of      BIGINT REFERENCES study_reports(id) ON DELETE SET NULL,
     created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS study_reports_status_created_idx
     ON study_reports(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS study_reports_word_type_idx
     ON study_reports(word_id, issue_type, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS study_reports_user_created_idx
     ON study_reports(user_id, created_at DESC)`,

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
  `ALTER TABLE study_reports    ENABLE ROW LEVEL SECURITY`,

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

  // Reports are written and managed through authenticated server routes.
  // No direct client policies are intentionally exposed in v1.

  // =====================================================================
  // Schema v4 — user-owned custom atlas.
  // Private source images + recognition candidates + user-corrected items
  // live under user_atlas_* tables. Sharing/public discovery uses separate
  // grants and public snapshot tables so we never relax the owner boundary
  // around raw images, AI responses, mastery, or SRS history.
  // =====================================================================
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,

  `CREATE TABLE IF NOT EXISTS user_atlas_images (
     id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     status           TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN
                       ('uploaded','processing','needs_review','confirmed','cards_ready','failed','deleted')),
     bucket           TEXT NOT NULL DEFAULT 'user-atlas-images',
     original_path    TEXT NOT NULL,
     thumb_path       TEXT NOT NULL,
     recognition_path TEXT NOT NULL,
     mime_type        TEXT NOT NULL,
     byte_size        INT NOT NULL CHECK (byte_size > 0),
     width            INT,
     height           INT,
     sha256           TEXT NOT NULL,
     perceptual_hash  TEXT,
     failure_reason   TEXT,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     deleted_at       TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS user_atlas_images_user_created_idx
     ON user_atlas_images(user_id, created_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS user_atlas_images_user_sha_idx
     ON user_atlas_images(user_id, sha256)
     WHERE deleted_at IS NULL`,

  `CREATE TABLE IF NOT EXISTS user_atlas_recognition_jobs (
     id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     image_id              UUID NOT NULL REFERENCES user_atlas_images(id) ON DELETE CASCADE,
     status                TEXT NOT NULL DEFAULT 'queued' CHECK (status IN
                           ('queued','running','needs_review','succeeded','failed','cancelled')),
     strategy              TEXT NOT NULL DEFAULT 'cost_first',
     stage                 TEXT NOT NULL DEFAULT 'primary' CHECK (stage IN
                           ('primary','fine','escalated','manual')),
     provider              TEXT,
     model                 TEXT,
     detail_level          TEXT,
     primary_confidence    NUMERIC(5,4),
     fine_confidence       NUMERIC(5,4),
     uncertainty_reason    TEXT,
     escalated             BOOLEAN NOT NULL DEFAULT FALSE,
     raw_response          JSONB,
     normalized_response   JSONB,
     error                 TEXT,
     started_at            TIMESTAMPTZ,
     finished_at           TIMESTAMPTZ,
     created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS user_atlas_jobs_user_created_idx
     ON user_atlas_recognition_jobs(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS user_atlas_jobs_status_idx
     ON user_atlas_recognition_jobs(status, created_at)`,

  `CREATE TABLE IF NOT EXISTS user_atlas_candidates (
     id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     job_id              UUID NOT NULL REFERENCES user_atlas_recognition_jobs(id) ON DELETE CASCADE,
     image_id            UUID NOT NULL REFERENCES user_atlas_images(id) ON DELETE CASCADE,
     level               TEXT NOT NULL CHECK (level IN ('primary','fine','attribute')),
     parent_candidate_id UUID REFERENCES user_atlas_candidates(id) ON DELETE CASCADE,
     label               TEXT NOT NULL,
     normalized_label    TEXT NOT NULL,
     zh_hant             TEXT,
     target_term         TEXT,
     target_language     TEXT NOT NULL DEFAULT 'en' CHECK (target_language IN ('en','ja')),
     taxonomy_node_id    TEXT,
     confidence          NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
     rank                INT NOT NULL,
     source              TEXT NOT NULL,
     bounding_box        JSONB,
     metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS user_atlas_candidates_job_rank_idx
     ON user_atlas_candidates(job_id, level, rank)`,
  // Gloss of the candidate in the capturing user's UI language (ja/en UIs
  // only; zh_hant above stays the universal base gloss).
  `ALTER TABLE user_atlas_candidates ADD COLUMN IF NOT EXISTS gloss TEXT`,

  `CREATE TABLE IF NOT EXISTS user_atlas_items (
     id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     image_id              UUID NOT NULL REFERENCES user_atlas_images(id) ON DELETE CASCADE,
     selected_candidate_id UUID REFERENCES user_atlas_candidates(id) ON DELETE SET NULL,
     target_language       TEXT NOT NULL DEFAULT 'en' CHECK (target_language IN ('en','ja')),
     canonical_word_id     TEXT REFERENCES words(id) ON DELETE SET NULL,
     primary_label         TEXT NOT NULL,
     fine_label            TEXT,
     lemma                 TEXT NOT NULL,
     display_zh_hant       TEXT NOT NULL,
     part_of_speech        TEXT,
     cefr_level            TEXT,
     pronunciation         TEXT,
     reading               TEXT,
     category              TEXT,
     taxonomy_path         TEXT[] NOT NULL DEFAULT '{}',
     definition_zh_hant    TEXT,
     definition_target     TEXT,
     example_target        TEXT,
     example_zh_hant       TEXT,
     note_zh_hant          TEXT,
     correction_source     TEXT NOT NULL DEFAULT 'user' CHECK (correction_source IN
                           ('candidate','manual','dictionary_match','ai_backfill')),
     backfill_status       TEXT NOT NULL DEFAULT 'pending' CHECK (backfill_status IN
                           ('pending','filled','failed','skipped')),
     backfill_error        TEXT,
     visibility            TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN
                           ('private','friends','public','unlisted')),
     -- 'pending' is the legacy single review queue; the moderation pipeline
     -- (docs/COMMUNITY_ATLAS_PLAN.md §5) splits it into pending_auto (waiting
     -- on the classifiers) and pending_review (classifier flagged → human).
     -- Legacy value kept so in-flight rows stay valid.
     -- 'withdrawn' is the author taking their own item down; 'takedown' is
     -- moderation removing it. Same visible effect, opposite meaning: only
     -- 'withdrawn' may be published again.
     review_status         TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN
                           ('draft','pending','pending_auto','pending_review',
                            'approved','rejected','takedown','withdrawn')),
     published_at          TIMESTAMPTZ,
     public_slug           TEXT,
     share_image_path      TEXT,
     cdn_cache_key         TEXT,
     created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
     deleted_at            TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS user_atlas_items_user_created_idx
     ON user_atlas_items(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS user_atlas_items_user_language_idx
     ON user_atlas_items(user_id, target_language, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS user_atlas_items_visibility_idx
     ON user_atlas_items(visibility, updated_at DESC)
     WHERE deleted_at IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS user_atlas_items_public_slug_uniq
     ON user_atlas_items(public_slug)
     WHERE public_slug IS NOT NULL`,
  // AI enrichment blob (enrichWord output: forms / etymology / synonyms /
  // antonyms / related / mnemonic). Definitions + pronunciation/reading live in
  // the dedicated columns above; this holds the structured extras.
  `ALTER TABLE user_atlas_items ADD COLUMN IF NOT EXISTS enrichment JSONB NOT NULL DEFAULT '{}'::jsonb`,
  // Gloss language follows the UI language: ja/en glosses of the lemma
  // (display_*) and dictionary definitions (definition_*) for interface
  // languages other than Chinese. zh-Hant stays the base columns above;
  // zh-Hans is OpenCC-derived at read time and never stored. Per-language
  // mnemonic/etymology live in enrichment.glossI18n.
  `ALTER TABLE user_atlas_items ADD COLUMN IF NOT EXISTS display_ja TEXT`,
  `ALTER TABLE user_atlas_items ADD COLUMN IF NOT EXISTS display_en TEXT`,
  `ALTER TABLE user_atlas_items ADD COLUMN IF NOT EXISTS definition_ja TEXT`,
  `ALTER TABLE user_atlas_items ADD COLUMN IF NOT EXISTS definition_en TEXT`,
  // Furigana split of `reading` over `lemma`; see word_terms.reading_segments.
  `ALTER TABLE user_atlas_items ADD COLUMN IF NOT EXISTS reading_segments JSONB`,

  // ---- Moderation pipeline (docs/COMMUNITY_ATLAS_PLAN.md §5) ----
  // Existing DBs carry the inline CHECK created with the table, which predates
  // pending_auto / pending_review. CREATE TABLE IF NOT EXISTS never alters it,
  // so swap the auto-named constraint for an explicitly named one. Guarded so
  // re-runs are no-ops.
  //
  // Guarded on the constraint's DEFINITION rather than its name, because the
  // name already exists on databases migrated before 'withdrawn' — a
  // name-only guard would silently skip them.
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'user_atlas_items_review_status_chk'
         AND pg_get_constraintdef(oid) LIKE '%withdrawn%'
     ) THEN
       ALTER TABLE user_atlas_items
         DROP CONSTRAINT IF EXISTS user_atlas_items_review_status_check;
       ALTER TABLE user_atlas_items
         DROP CONSTRAINT IF EXISTS user_atlas_items_review_status_chk;
       ALTER TABLE user_atlas_items
         ADD CONSTRAINT user_atlas_items_review_status_chk
         CHECK (review_status IN
           ('draft','pending','pending_auto','pending_review',
            'approved','rejected','takedown','withdrawn'));
     END IF;
   END $$`,
  // Machine + human moderation audit trail. Used to tune thresholds and to
  // show admins why an item was flagged. Privacy: never store raw image URLs
  // or free-text payloads here (same rule as the events table).
  `CREATE TABLE IF NOT EXISTS atlas_moderation_events (
     id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     item_id     UUID NOT NULL REFERENCES user_atlas_items(id) ON DELETE CASCADE,
     phase       TEXT NOT NULL CHECK (phase IN ('auto','report','heat','admin')),
     verdict     TEXT NOT NULL CHECK (verdict IN ('approved','flagged','rejected','takedown','cleared')),
     categories  JSONB NOT NULL DEFAULT '[]'::jsonb,
     scores      JSONB NOT NULL DEFAULT '{}'::jsonb,
     actor       TEXT,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS atlas_moderation_events_item_idx
     ON atlas_moderation_events(item_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS atlas_moderation_events_phase_idx
     ON atlas_moderation_events(phase, created_at DESC)`,
  // Per-author moderation standing. Repeat offenders get restricted (cannot
  // submit for review) or banned. Absence of a row means "good standing".
  `CREATE TABLE IF NOT EXISTS user_moderation_state (
     user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
     state        TEXT NOT NULL DEFAULT 'ok' CHECK (state IN ('ok','warned','restricted','banned')),
     strikes      INTEGER NOT NULL DEFAULT 0,
     reason       TEXT,
     updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS user_atlas_cards (
     id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     item_id          UUID NOT NULL REFERENCES user_atlas_items(id) ON DELETE CASCADE,
     image_id         UUID NOT NULL REFERENCES user_atlas_images(id) ON DELETE CASCADE,
     deck_key         TEXT NOT NULL CHECK (deck_key IN ('atlas-image-en','atlas-image-ja')),
     card_type        TEXT NOT NULL CHECK (card_type IN
                      ('image_recall','word_recall','spelling','flashcard')),
     front_text       TEXT,
     front_image_path TEXT,
     back             TEXT NOT NULL,
     explanation      TEXT,
     tags             TEXT[] NOT NULL DEFAULT '{}',
     metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     deleted_at       TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS user_atlas_cards_user_item_idx
     ON user_atlas_cards(user_id, item_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS user_atlas_cards_unique_type_idx
     ON user_atlas_cards(user_id, item_id, deck_key, card_type)
     WHERE deleted_at IS NULL`,

  `CREATE TABLE IF NOT EXISTS user_atlas_card_state (
     user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     card_id          UUID NOT NULL REFERENCES user_atlas_cards(id) ON DELETE CASCADE,
     status           TEXT NOT NULL DEFAULT '新卡' CHECK (status IN ('新卡','學習中','複習中','穩定')),
     interval_days    NUMERIC(10,4) NOT NULL DEFAULT 0,
     next_review_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     review_count     INT NOT NULL DEFAULT 0,
     mistake_count    INT NOT NULL DEFAULT 0,
     last_rating      TEXT CHECK (last_rating IN ('重來','困難','穩定','熟練')),
     last_reviewed_at TIMESTAMPTZ,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, card_id)
   )`,
  `CREATE INDEX IF NOT EXISTS user_atlas_card_state_due_idx
     ON user_atlas_card_state(user_id, next_review_at)`,

  `CREATE TABLE IF NOT EXISTS user_atlas_item_mastery (
     user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     item_id          UUID NOT NULL REFERENCES user_atlas_items(id) ON DELETE CASCADE,
     target_language  TEXT NOT NULL DEFAULT 'en' CHECK (target_language IN ('en','ja')),
     mastery          NUMERIC(5,2) NOT NULL DEFAULT 0,
     last_reviewed_at TIMESTAMPTZ,
     review_count     INT NOT NULL DEFAULT 0,
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, item_id, target_language)
   )`,
  `CREATE INDEX IF NOT EXISTS user_atlas_mastery_user_language_idx
     ON user_atlas_item_mastery(user_id, target_language, mastery)`,

  `CREATE TABLE IF NOT EXISTS user_atlas_study_logs (
     id                BIGSERIAL PRIMARY KEY,
     user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     item_id           UUID REFERENCES user_atlas_items(id) ON DELETE SET NULL,
     card_id           UUID REFERENCES user_atlas_cards(id) ON DELETE SET NULL,
     image_id          UUID REFERENCES user_atlas_images(id) ON DELETE SET NULL,
     target_language   TEXT NOT NULL DEFAULT 'en' CHECK (target_language IN ('en','ja')),
     activity          TEXT NOT NULL CHECK (activity IN
                         ('flashcard','mcq','typing','listening','image_recall','reading')),
     rating            SMALLINT NOT NULL CHECK (rating IN (0,1,2,3)),
     is_correct        BOOLEAN,
     response_ms       INT,
     interval_before   NUMERIC(10,4),
     interval_after    NUMERIC(10,4),
     mastery_before    NUMERIC(5,2),
     mastery_after     NUMERIC(5,2),
     client_session_id TEXT,
     metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS user_atlas_logs_user_created_idx
     ON user_atlas_study_logs(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS user_atlas_logs_user_language_created_idx
     ON user_atlas_study_logs(user_id, target_language, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS user_atlas_ai_usage (
     id                 BIGSERIAL PRIMARY KEY,
     user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     job_id             UUID REFERENCES user_atlas_recognition_jobs(id) ON DELETE SET NULL,
     image_id           UUID REFERENCES user_atlas_images(id) ON DELETE SET NULL,
     provider           TEXT NOT NULL,
     model              TEXT,
     operation          TEXT NOT NULL,
     detail_level       TEXT,
     input_tokens       INT,
     output_tokens      INT,
     image_count        INT NOT NULL DEFAULT 1,
     estimated_cost_usd NUMERIC(10,6),
     latency_ms         INT,
     success            BOOLEAN NOT NULL DEFAULT TRUE,
     created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS user_atlas_ai_usage_user_created_idx
     ON user_atlas_ai_usage(user_id, created_at DESC)`,

  // Generic fixed-window rate-limit counters. One row per (bucket, window):
  // the atlas AI guards increment atlas-ai:user:<id> (daily), atlas-ai:ip:<hash>
  // (per-minute) and atlas-ai:global (daily). Pruned by the atlas-cleanup cron.
  `CREATE TABLE IF NOT EXISTS ratelimit_hits (
     bucket       TEXT NOT NULL,
     window_start TIMESTAMPTZ NOT NULL,
     count        INT NOT NULL DEFAULT 0,
     PRIMARY KEY (bucket, window_start)
   )`,
  `CREATE INDEX IF NOT EXISTS ratelimit_hits_window_idx
     ON ratelimit_hits(window_start)`,

  // Atlas entitlement (Free/Pro). One row per user; absent row = free. `source`
  // records where Pro came from (e.g. appstore); `expires_at` lets an expired
  // subscription lapse back to free without a row delete. StoreKit / App Store
  // Server Notifications (Phase 2) write here; server stays the authority.
  `CREATE TABLE IF NOT EXISTS user_entitlements (
     user_id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
     tier                    TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','pro')),
     source                  TEXT,
     expires_at              TIMESTAMPTZ,
     original_transaction_id TEXT,
     created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // Maps an App Store subscription back to the user so the notifications webhook
  // (renew / refund / expire) can find them without an authenticated request.
  // Superseded by the UNIQUE index created in enforceSubscriptionBinding() —
  // kept here so a fresh DB has the lookup index before that step runs.
  `CREATE INDEX IF NOT EXISTS user_entitlements_original_txn_idx
     ON user_entitlements(original_transaction_id)
     WHERE original_transaction_id IS NOT NULL`,

  // Manual Pro grants (comps, apology credit, reviewer access). Deliberately a
  // SEPARATE table from user_entitlements, which holds the App Store
  // subscription — see docs/adr/0004 in tuji-ios. One row per grant, kept
  // append-only: revoking sets revoked_at rather than deleting, so "why was
  // this person Pro last March" stays answerable. A user's effective tier is
  // the UNION of their subscription and their live grants (later expiry wins),
  // which is what makes compensating a paying subscriber actually work.
  `CREATE TABLE IF NOT EXISTS user_entitlement_grants (
     id            BIGSERIAL PRIMARY KEY,
     user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     tier          TEXT NOT NULL DEFAULT 'pro' CHECK (tier = 'pro'),
     expires_at    TIMESTAMPTZ NOT NULL,
     reason        TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
     granted_by    TEXT NOT NULL,
     granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
     revoked_at    TIMESTAMPTZ,
     revoke_reason TEXT
   )`,
  // Partial index: the hot read is "does this user have a live grant right
  // now", which only ever looks at un-revoked rows.
  `CREATE INDEX IF NOT EXISTS user_entitlement_grants_live_idx
     ON user_entitlement_grants(user_id, expires_at DESC)
     WHERE revoked_at IS NULL`,

  // Append-only ledger of entitlement transitions. user_entitlements is
  // upserted in place and therefore has no history; without this table
  // questions like "how many upgraded this month" are unanswerable forever,
  // because this data cannot be backfilled after the fact. Written by
  // upsertAtlasEntitlement / the grant helpers, never updated or deleted.
  //
  // NOT a billing record: App Store Connect remains the authority for revenue,
  // refunds and churn. This exists to join entitlement changes to OUR user ids,
  // which is the one thing Apple's reports can never do.
  `CREATE TABLE IF NOT EXISTS user_entitlement_events (
     id                      BIGSERIAL PRIMARY KEY,
     user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     from_tier               TEXT,
     to_tier                 TEXT NOT NULL CHECK (to_tier IN ('free','pro')),
     from_expires_at         TIMESTAMPTZ,
     to_expires_at           TIMESTAMPTZ,
     -- Which mechanism moved it: appstore | grant | grant_revoke | transfer.
     channel                 TEXT NOT NULL,
     -- Free text from the writer: the App Store source, or an admin's reason.
     reason                  TEXT,
     -- Who caused it: 'appstore', 'system', or an admin identifier.
     actor                   TEXT NOT NULL DEFAULT 'system',
     original_transaction_id TEXT,
     created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS user_entitlement_events_user_idx
     ON user_entitlement_events(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS user_entitlement_events_created_idx
     ON user_entitlement_events(created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS user_friendships (
     user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     friend_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','blocked')),
     created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, friend_user_id),
     CHECK (user_id <> friend_user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS user_friendships_friend_idx
     ON user_friendships(friend_user_id, status)`,

  `CREATE TABLE IF NOT EXISTS atlas_item_grants (
     item_id         UUID NOT NULL REFERENCES user_atlas_items(id) ON DELETE CASCADE,
     owner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     viewer_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     scope           TEXT NOT NULL DEFAULT 'view' CHECK (scope IN ('view')),
     created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (item_id, viewer_user_id),
     CHECK (owner_user_id <> viewer_user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS atlas_item_grants_viewer_idx
     ON atlas_item_grants(viewer_user_id, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS atlas_public_items (
     id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     source_item_id    UUID NOT NULL REFERENCES user_atlas_items(id) ON DELETE CASCADE,
     owner_user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     public_slug       TEXT NOT NULL UNIQUE,
     lemma             TEXT NOT NULL,
     display_zh_hant   TEXT NOT NULL,
     target_language   TEXT NOT NULL CHECK (target_language IN ('en','ja')),
     category          TEXT,
     image_public_path TEXT,
     -- DEAD. Author identity is joined live from profiles (lib/public-author.ts)
     -- so a rename updates everything the author ever published. Kept only
     -- because dropping a column is irreversible and nothing reads this one;
     -- do not wire anything to it.
     attribution_name  TEXT,
     -- 'withdrawn' = the author took it down themselves and may republish;
     -- 'takedown' = moderation removed it and they may not.
     review_status     TEXT NOT NULL CHECK (review_status IN ('approved','takedown','withdrawn')),
     published_at      TIMESTAMPTZ NOT NULL,
     updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // Existing databases carry the auto-named inline CHECK from CREATE TABLE,
  // which predates 'withdrawn'. Guarded on the definition so re-runs are
  // no-ops (same pattern as user_atlas_items above).
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'atlas_public_items_review_status_chk'
         AND pg_get_constraintdef(oid) LIKE '%withdrawn%'
     ) THEN
       ALTER TABLE atlas_public_items
         DROP CONSTRAINT IF EXISTS atlas_public_items_review_status_check;
       ALTER TABLE atlas_public_items
         DROP CONSTRAINT IF EXISTS atlas_public_items_review_status_chk;
       ALTER TABLE atlas_public_items
         ADD CONSTRAINT atlas_public_items_review_status_chk
         CHECK (review_status IN ('approved','takedown','withdrawn'));
     END IF;
   END $$`,
  `CREATE INDEX IF NOT EXISTS atlas_public_items_published_idx
     ON atlas_public_items(published_at DESC)
     WHERE review_status = 'approved'`,
  // Community aggregation (docs/COMMUNITY_ATLAS_PLAN.md §1 原則 2): the word
  // detail page asks "who else published this lemma?", so the hot lookup is
  // (lemma, target_language) among approved rows. Lowercased to match the
  // case-insensitive lookup in listAtlasPublicItemsByLemma.
  `CREATE INDEX IF NOT EXISTS atlas_public_items_lemma_lang_idx
     ON atlas_public_items(lower(lemma), target_language, published_at DESC)
     WHERE review_status = 'approved'`,

  // Saved community items — the CONSUMPTION quota (docs/COMMUNITY_ATLAS_PLAN.md
  // §4.1). Deliberately its own table rather than rows in user_atlas_items:
  // getAtlasUsage() counts user_atlas_items to enforce the *creation* limit
  // (Free 3 slots), so storing saves there would make collecting other people's
  // photos eat the free tier's creation budget — the exact red line the plan
  // forbids. Keeping them separate means saves can never consume creation slots.
  `CREATE TABLE IF NOT EXISTS atlas_saves (
     user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     public_item_id UUID NOT NULL REFERENCES atlas_public_items(id) ON DELETE CASCADE,
     created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, public_item_id)
   )`,
  `CREATE INDEX IF NOT EXISTS atlas_saves_user_idx
     ON atlas_saves(user_id, created_at DESC)`,
  // Supports the "N people saved this" counter per public item.
  `CREATE INDEX IF NOT EXISTS atlas_saves_item_idx
     ON atlas_saves(public_item_id)`,

  // SRS rows for saved community items — the review side of a save.
  //
  // Card + state live in ONE row because the cards are virtual: a saved public
  // item always yields exactly image_recall + flashcard, derived from the
  // public row rather than generated (no AI cost, no duplicated image). Rows
  // are materialised when the item is saved so every card has a real UUID the
  // existing answer path can address, and deleted when it is unsaved.
  //
  // Crucially this table — not user_atlas_items — is where saved study data
  // lives, which is what makes it structurally impossible for saving to eat
  // the creation quota (docs/COMMUNITY_ATLAS_PLAN.md §4.1).
  `CREATE TABLE IF NOT EXISTS atlas_saved_cards (
     id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     public_item_id   UUID NOT NULL REFERENCES atlas_public_items(id) ON DELETE CASCADE,
     card_type        TEXT NOT NULL CHECK (card_type IN ('image_recall','flashcard')),
     status           TEXT NOT NULL DEFAULT '新卡' CHECK (status IN ('新卡','學習中','複習中','穩定')),
     interval_days    NUMERIC(10,4) NOT NULL DEFAULT 0,
     next_review_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     review_count     INT NOT NULL DEFAULT 0,
     mistake_count    INT NOT NULL DEFAULT 0,
     last_rating      TEXT CHECK (last_rating IN ('重來','困難','穩定','熟練')),
     last_reviewed_at TIMESTAMPTZ,
     mastery          NUMERIC(6,2) NOT NULL DEFAULT 0,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (user_id, public_item_id, card_type)
   )`,
  `CREATE INDEX IF NOT EXISTS atlas_saved_cards_due_idx
     ON atlas_saved_cards(user_id, next_review_at)`,

  // User-submitted reports on public 圖鑑 items (UGC moderation, §5). One report
  // per (public item, reporter); source_item_id lets admin jump to the existing
  // takedown action, which keys on user_atlas_items.id.
  `CREATE TABLE IF NOT EXISTS atlas_reports (
     id               BIGSERIAL PRIMARY KEY,
     public_item_id   UUID NOT NULL REFERENCES atlas_public_items(id) ON DELETE CASCADE,
     source_item_id   UUID REFERENCES user_atlas_items(id) ON DELETE SET NULL,
     slug             TEXT NOT NULL,
     reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     reason           TEXT NOT NULL CHECK (reason IN
                        ('spam','inappropriate','copyright','wrong','other')),
     detail           TEXT,
     status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN
                        ('open','reviewed','dismissed')),
     created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (public_item_id, reporter_user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS atlas_reports_status_created_idx
     ON atlas_reports(status, created_at DESC)`,

  // Reports go polymorphic: an item, a 合集, or an author identity. One table
  // and therefore ONE admin queue — a moderator who has to remember to check
  // three lists will eventually check two.
  //
  // Additive and ordered so a half-applied run is still consistent: add the
  // columns, backfill them from the item columns every existing row already
  // has, and only then relax the old NOT NULL and swap the uniqueness rule.
  `ALTER TABLE atlas_reports
     ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'item'`,
  `ALTER TABLE atlas_reports ADD COLUMN IF NOT EXISTS target_id UUID`,
  `UPDATE atlas_reports
     SET target_id = public_item_id
     WHERE target_id IS NULL AND public_item_id IS NOT NULL`,
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'atlas_reports_target_type_chk'
     ) THEN
       ALTER TABLE atlas_reports
         ADD CONSTRAINT atlas_reports_target_type_chk
         CHECK (target_type IN ('item','collection','author'));
     END IF;
   END $$`,
  // A collection or author report has no public item to point at.
  `ALTER TABLE atlas_reports ALTER COLUMN public_item_id DROP NOT NULL`,
  // The old key only understood items; uniqueness is now per target.
  `ALTER TABLE atlas_reports
     DROP CONSTRAINT IF EXISTS atlas_reports_public_item_id_reporter_user_id_key`,
  `CREATE UNIQUE INDEX IF NOT EXISTS atlas_reports_target_reporter_key
     ON atlas_reports(target_type, target_id, reporter_user_id)`,
  `CREATE INDEX IF NOT EXISTS atlas_reports_target_idx
     ON atlas_reports(target_type, target_id)`,

  // 封鎖: one-way "never show me this author again".
  //
  // Tuji has no comments, no messages and no follows — the only thing one user
  // can do to another is publish something the other sees. So a block cannot
  // mean "stop them contacting me"; it means "stop surfacing them to me", and
  // it is deliberately one-way: hiding my atlas from someone I blocked would
  // punish them without protecting me.
  //
  // Discovery only. Anything already saved stays, because it is already the
  // blocker's own study material and the author is just its provenance — the
  // same principle that makes 取消公開 reversible instead of destructive.
  `CREATE TABLE IF NOT EXISTS user_blocks (
     blocker_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (blocker_user_id, blocked_user_id),
     CHECK (blocker_user_id <> blocked_user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx
     ON user_blocks(blocker_user_id, created_at DESC)`,

  `ALTER TABLE user_atlas_images           ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_atlas_recognition_jobs ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_atlas_candidates       ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_atlas_items            ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_atlas_cards            ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_atlas_card_state       ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_atlas_item_mastery     ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_atlas_study_logs       ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_atlas_ai_usage         ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_friendships            ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE atlas_item_grants           ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE atlas_public_items          ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE atlas_reports               ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_blocks                 ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS user_blocks_own ON user_blocks`,
  // Only the blocker ever reads or writes their own list. The blocked user must
  // not be able to tell — a block is invisible by design.
  `CREATE POLICY user_blocks_own ON user_blocks FOR ALL
     USING (auth.uid() = blocker_user_id) WITH CHECK (auth.uid() = blocker_user_id)`,

  ...[
    "user_atlas_images",
    "user_atlas_recognition_jobs",
    "user_atlas_candidates",
    "user_atlas_items",
    "user_atlas_cards",
    "user_atlas_card_state",
    "user_atlas_item_mastery",
    "user_atlas_study_logs",
    "user_atlas_ai_usage",
  ].flatMap((t) => [
    `DROP POLICY IF EXISTS ${t}_own ON ${t}`,
    `CREATE POLICY ${t}_own ON ${t} FOR ALL
       USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`,
  ]),

  `DROP POLICY IF EXISTS user_friendships_own ON user_friendships`,
  `CREATE POLICY user_friendships_own ON user_friendships FOR ALL
     USING (auth.uid() = user_id OR auth.uid() = friend_user_id)
     WITH CHECK (auth.uid() = user_id)`,
  `DROP POLICY IF EXISTS atlas_item_grants_owner_or_viewer ON atlas_item_grants`,
  `CREATE POLICY atlas_item_grants_owner_or_viewer ON atlas_item_grants FOR SELECT
     USING (auth.uid() = owner_user_id OR auth.uid() = viewer_user_id)`,
  `DROP POLICY IF EXISTS atlas_item_grants_owner_write ON atlas_item_grants`,
  `CREATE POLICY atlas_item_grants_owner_write ON atlas_item_grants FOR INSERT
     WITH CHECK (auth.uid() = owner_user_id)`,
  `DROP POLICY IF EXISTS atlas_item_grants_owner_delete ON atlas_item_grants`,
  `CREATE POLICY atlas_item_grants_owner_delete ON atlas_item_grants FOR DELETE
     USING (auth.uid() = owner_user_id)`,
  `DROP POLICY IF EXISTS atlas_public_items_public_read ON atlas_public_items`,
  `CREATE POLICY atlas_public_items_public_read ON atlas_public_items FOR SELECT
     USING (review_status = 'approved')`,

  // Community collections (合集): a user-authored, named grouping over their OWN
  // approved public items. Unlike atlas_public_items — which only ever holds
  // approved/takedown rows because drafts live in user_atlas_items — a collection
  // IS the authored entity, so it carries the full review lifecycle in this row.
  // Cover is a chosen member item's already-public image (no separate upload), so
  // publishing only needs a text gate on title/description.
  `CREATE TABLE IF NOT EXISTS atlas_collections (
     id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     owner_user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     slug                 TEXT NOT NULL UNIQUE,
     title                TEXT NOT NULL,
     description          TEXT,
     target_language      TEXT NOT NULL CHECK (target_language IN ('en','ja')),
     cover_public_item_id UUID REFERENCES atlas_public_items(id) ON DELETE SET NULL,
     avatar_private_path  TEXT,
     avatar_color         TEXT,
     -- Same 'withdrawn' vs 'takedown' split as items: the author's own removal
     -- is reversible, moderation's is not.
     review_status        TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN
                            ('draft','pending_review','approved','rejected',
                             'takedown','withdrawn')),
     created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
     published_at         TIMESTAMPTZ
   )`,
  `ALTER TABLE atlas_collections ADD COLUMN IF NOT EXISTS avatar_private_path TEXT`,
  `ALTER TABLE atlas_collections ADD COLUMN IF NOT EXISTS avatar_color TEXT`,
  `ALTER TABLE atlas_collections ADD COLUMN IF NOT EXISTS content_review_approved_at TIMESTAMPTZ`,
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'atlas_collections_avatar_color_chk'
         AND conrelid = 'atlas_collections'::regclass
     ) THEN
       ALTER TABLE atlas_collections
         ADD CONSTRAINT atlas_collections_avatar_color_chk
         CHECK (avatar_color IS NULL OR avatar_color ~ '^#[0-9a-f]{6}$');
     END IF;
   END $$`,
  // Same definition-guarded swap as the item tables: databases created before
  // 'withdrawn' carry the narrower inline CHECK under the auto-generated name.
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'atlas_collections_review_status_chk'
         AND pg_get_constraintdef(oid) LIKE '%withdrawn%'
     ) THEN
       ALTER TABLE atlas_collections
         DROP CONSTRAINT IF EXISTS atlas_collections_review_status_check;
       ALTER TABLE atlas_collections
         DROP CONSTRAINT IF EXISTS atlas_collections_review_status_chk;
       ALTER TABLE atlas_collections
         ADD CONSTRAINT atlas_collections_review_status_chk
         CHECK (review_status IN
           ('draft','pending_review','approved','rejected','takedown','withdrawn'));
     END IF;
   END $$`,
  // Browse hot path: approved collections for one learning language, newest first.
  `CREATE INDEX IF NOT EXISTS atlas_collections_browse_idx
     ON atlas_collections(target_language, published_at DESC)
     WHERE review_status = 'approved'`,
  `CREATE INDEX IF NOT EXISTS atlas_collections_owner_idx
     ON atlas_collections(owner_user_id, updated_at DESC)`,

  // Ordered membership. Members are the owner's own confirmed source items in
  // the collection language; public_item_id is attached only after approval.
  `CREATE TABLE IF NOT EXISTS atlas_collection_items (
     collection_id  UUID NOT NULL REFERENCES atlas_collections(id) ON DELETE CASCADE,
     public_item_id UUID NOT NULL REFERENCES atlas_public_items(id) ON DELETE CASCADE,
     position       INT NOT NULL DEFAULT 0,
     created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (collection_id, public_item_id)
   )`,
  // A collection is authored from the owner's confirmed source items. The
  // public row is attached only when the item and collection pass moderation.
  `ALTER TABLE atlas_collection_items
     ADD COLUMN IF NOT EXISTS source_item_id UUID REFERENCES user_atlas_items(id) ON DELETE CASCADE`,
  `UPDATE atlas_collection_items ci
      SET source_item_id = pi.source_item_id
     FROM atlas_public_items pi
    WHERE ci.public_item_id = pi.id
      AND ci.source_item_id IS NULL`,
  `ALTER TABLE atlas_collection_items ALTER COLUMN source_item_id SET NOT NULL`,
  `DO $$ BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'atlas_collection_items'::regclass
         AND conname = 'atlas_collection_items_pkey'
         AND pg_get_constraintdef(oid) = 'PRIMARY KEY (collection_id, public_item_id)'
     ) THEN
       ALTER TABLE atlas_collection_items DROP CONSTRAINT atlas_collection_items_pkey;
     END IF;
   END $$`,
  `ALTER TABLE atlas_collection_items ALTER COLUMN public_item_id DROP NOT NULL`,
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'atlas_collection_items'::regclass
         AND conname = 'atlas_collection_items_pkey'
     ) THEN
       ALTER TABLE atlas_collection_items
         ADD CONSTRAINT atlas_collection_items_pkey PRIMARY KEY (collection_id, source_item_id);
     END IF;
   END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS atlas_collection_items_public_unique_idx
     ON atlas_collection_items(collection_id, public_item_id)
     WHERE public_item_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS atlas_collection_items_order_idx
     ON atlas_collection_items(collection_id, position)`,

  // Saved public collections are bookmarks to the collection itself. They are
  // intentionally separate from atlas_saves / atlas_saved_cards: saving a
  // shelf must never save its member items, create study cards, or consume the
  // saved-item quota.
  `CREATE TABLE IF NOT EXISTS atlas_collection_saves (
     user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     collection_id UUID NOT NULL REFERENCES atlas_collections(id) ON DELETE CASCADE,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, collection_id)
   )`,
  `CREATE INDEX IF NOT EXISTS atlas_collection_saves_user_idx
     ON atlas_collection_saves(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS atlas_collection_saves_collection_idx
     ON atlas_collection_saves(collection_id)`,

  // Machine-gate audit for collection submissions. Text-only (title + description),
  // mirroring atlas_moderation_events for items.
  `CREATE TABLE IF NOT EXISTS atlas_collection_moderation_events (
     id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     collection_id UUID NOT NULL REFERENCES atlas_collections(id) ON DELETE CASCADE,
     phase         TEXT NOT NULL CHECK (phase IN ('auto','report','heat','admin')),
     verdict       TEXT NOT NULL CHECK (verdict IN ('approved','flagged','rejected','takedown','cleared')),
     categories    JSONB NOT NULL DEFAULT '[]'::jsonb,
     scores        JSONB NOT NULL DEFAULT '{}'::jsonb,
     actor         TEXT,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS atlas_collection_moderation_events_idx
     ON atlas_collection_moderation_events(collection_id, created_at DESC)`,

  // RLS mirrors atlas_public_items: owner-owns-their-rows + public read of
  // approved. The membership/save/audit tables are server-only (service-role
  // reads), matching atlas_saves / atlas_saved_cards which likewise carry no RLS.
  `ALTER TABLE atlas_collections ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS atlas_collections_owner ON atlas_collections`,
  `CREATE POLICY atlas_collections_owner ON atlas_collections FOR ALL
     USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id)`,
  `DROP POLICY IF EXISTS atlas_collections_public_read ON atlas_collections`,
  `CREATE POLICY atlas_collections_public_read ON atlas_collections FOR SELECT
     USING (review_status = 'approved')`,

  // =====================================================================
  // Schema v3+ — multi-language overlays.
  // `category_translations`: per-language names overlaid on top of
  //   `categories.name` (en) / `categories.name_zh` (zh-Hant). `zh-Hant` is
  //   the fallback source; `zh-Hans` is runtime-converted via OpenCC so
  //   nothing is stored here for it by default. Other langs (ja, …) are
  //   filled in by `npm run translate`.
  // `word_localized_texts`: per-language overrides for the long-form word
  //   fields whose base columns are single-language (zh-Hant) on `words`:
  //   `etymology` and `note`. Reads prefer (field, language) here, then
  //   fall back to the base column.
  // Both are append-only overlays; the base zh-Hant columns stay as the
  // source of truth.
  // =====================================================================
  `CREATE TABLE IF NOT EXISTS category_translations (
     category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
     language    TEXT NOT NULL,
     name        TEXT NOT NULL,
     PRIMARY KEY (category_id, language)
   )`,
  `CREATE INDEX IF NOT EXISTS category_translations_lang_idx
     ON category_translations(language, category_id)`,

  `CREATE TABLE IF NOT EXISTS word_localized_texts (
     word_id  TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     field    TEXT NOT NULL CHECK (field IN ('etymology','note')),
     language TEXT NOT NULL,
     value    TEXT NOT NULL,
     PRIMARY KEY (word_id, field, language)
   )`,
  `CREATE INDEX IF NOT EXISTS word_localized_texts_lookup_idx
     ON word_localized_texts(word_id, language)`,

  `ALTER TABLE category_translations  ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE word_localized_texts   ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS category_translations_public_read ON category_translations`,
  `CREATE POLICY category_translations_public_read ON category_translations FOR SELECT USING (true)`,
  `DROP POLICY IF EXISTS word_localized_texts_public_read ON word_localized_texts`,
  `CREATE POLICY word_localized_texts_public_read ON word_localized_texts FOR SELECT USING (true)`,

  // Japanese category names the translate pipeline never generated (it skips
  // zodiac + custom). English names come from categories.name at read time,
  // so only ja needs a stored row. Idempotent; leaves manual edits alone.
  //
  // 物見 is here for the opposite reason: it is already Japanese, so the right
  // ja name is the zh-Hant one unchanged. Without a stored row `translate.ts`
  // would see a category missing ja, hand 物見 to the model, and store the
  // paraphrase it comes back with — replacing a native word with a translation
  // of itself.
  `INSERT INTO category_translations (category_id, language, name) VALUES
     ('zodiac', 'ja', '星座'),
     ('custom', 'ja', 'カスタム'),
     ('community', 'ja', '物見')
   ON CONFLICT (category_id, language) DO NOTHING`,

  // ---- localized category descriptions ----
  // The one-line description under a theme's title used to be zh-Hant for every
  // reader: `localizeCategory` swapped the *name* for ja/en and left the
  // description alone, because there was nowhere to put a translated one. These
  // two columns are that somewhere, and they follow the split the names already
  // use — English on the base row next to `name`, other languages on the
  // overlay next to the overlay's `name`.
  `ALTER TABLE categories ADD COLUMN IF NOT EXISTS description_en TEXT`,
  `ALTER TABLE category_translations ADD COLUMN IF NOT EXISTS description TEXT`,

  // Hand-written rather than run through `translate.ts`: twelve fixed lines of
  // product copy, where a model's paraphrase is worse than a person's sentence.
  //
  // Descriptions only. The name column is carried over from whatever row is
  // already there (`translate.ts` wrote most of them) and only falls back to
  // the zh-Hant name when the overlay row does not exist yet, which is the same
  // thing a reader would have seen anyway. Writing names here would have
  // overwritten the pipeline's work — 交通 for 乗り物, and so on.
  //
  // Only fills a description that is still NULL, so a later edit survives.
  `INSERT INTO category_translations (category_id, language, name, description)
   SELECT v.id, 'ja', COALESCE(ct.name, c.name_zh), v.description
     FROM (VALUES
       ('custom',         '自分の写真から作った単語カード'),
       ('community',      'ほかの人が公開した図鑑から保存したカード'),
       ('kitchen',        '料理をする場所'),
       ('bathroom',       '洗面と身支度の空間'),
       ('bedroom',        '休息と睡眠の場所'),
       ('living-room',    '家族が集まる空間'),
       ('office',         '仕事と勉強の環境'),
       ('street',         '街を歩く'),
       ('supermarket',    '日々の買い物'),
       ('transportation', '世界を移動する手段'),
       ('seasonings',     '料理をおいしくする名脇役'),
       ('zodiac',         '十二星座と英語の名前')
     ) AS v(id, description)
     JOIN categories c ON c.id = v.id
     LEFT JOIN category_translations ct
       ON ct.category_id = v.id AND ct.language = 'ja'
   ON CONFLICT (category_id, language) DO UPDATE SET
     description = EXCLUDED.description
   WHERE category_translations.description IS NULL`,

  // ---- feedback: general user feedback from the app's 意見收集 form ----
  // Account-level (not tied to a word/card) — study-card issues go through
  // study_reports instead.
  `CREATE TABLE IF NOT EXISTS feedback (
     id            BIGSERIAL PRIMARY KEY,
     request_id    UUID NOT NULL UNIQUE,
     user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
     feedback_type TEXT NOT NULL CHECK (feedback_type IN
                     ('feature','bug','content','other')),
     description   TEXT NOT NULL CHECK (
                     char_length(btrim(description)) BETWEEN 1 AND 1000
                   ),
     platform      TEXT NOT NULL CHECK (platform IN ('web','ios')),
     app_version   TEXT,
     ui_lang       TEXT NOT NULL,
     status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
                     ('pending','reviewing','resolved','rejected','duplicate')),
     internal_note TEXT,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS feedback_status_created_idx
     ON feedback(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS feedback_user_created_idx
     ON feedback(user_id, created_at DESC)`,
  `ALTER TABLE feedback ENABLE ROW LEVEL SECURITY`,
  // Feedback is written and managed through authenticated server routes.
  // No direct client policies are intentionally exposed in v1.

  // ---- events v2: platform split (web|ios) + composite index ----
  // DEFAULT 'web' backfills all pre-existing rows (they were all web) and
  // covers old web clients that don't send the field.
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'web'`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_platform_chk') THEN
       ALTER TABLE events ADD CONSTRAINT events_platform_chk
         CHECK (platform IN ('web','ios'));
     END IF;
   END $$`,
  `CREATE INDEX IF NOT EXISTS events_type_created_idx
     ON events(type, created_at DESC)`,

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

// Existing public nicknames cross the exact same moderation seam as a new
// Profile edit before zero-item profiles become visible. Session-only metadata
// is deliberately ignored: profiles is the sole authoritative source.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function moderateExistingProfileNicknames(sql: any) {
  const rows = await sql<{ id: string; nickname: string }[]>`
    SELECT id, nickname FROM profiles WHERE nickname IS NOT NULL
  `;
  let cleared = 0;
  let normalized = 0;
  for (const row of rows) {
    const nickname = row.nickname.trim();
    const rejected = nickname !== "" && runAtlasTextModeration([nickname]).length > 0;
    if (!nickname || rejected) {
      await sql`UPDATE profiles SET nickname = NULL WHERE id = ${row.id}::uuid`;
      cleared += 1;
    } else if (nickname !== row.nickname) {
      await sql`UPDATE profiles SET nickname = ${nickname} WHERE id = ${row.id}::uuid`;
      normalized += 1;
    }
  }
  console.log(`[migrate] profile nicknames moderated (${cleared} cleared, ${normalized} normalized).`);
}

// ---- card generator ----

interface SeedCard {
  cardType: string;
  front: string;
  back: string;
  explanation: string;
  tags: string[];
  deckKey: string;
}

function cardsForWord(w: (typeof seedWords)[number]): SeedCard[] {
  // One card per word: image-en (look at image → choose English MCQ).
  // The picture itself is the prompt (rendered by WordTile in StudyClient),
  // so `front` stays empty. The card_type remains "回想卡" so it qualifies
  // as MCQ in lib/cards-db.ts:MCQ_TYPES.
  return [
    {
      cardType: "回想卡",
      front: "",
      back: w.word,
      explanation: `${w.word} ${w.pronunciation} — ${w.chinese}`,
      tags: [w.category, w.partOfSpeech, "看圖選英文"],
      deckKey: "image-en",
    },
  ];
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
// (`lib/categories.ts`). Idempotent and additive: adding a new category to that
// file just inserts one more row on the next deploy.
//
// On conflict, **every display field** is refreshed, so the seed file is the
// source of truth for all of them. It used to refresh only image_url and
// sort_order, which quietly made the other fields code-shaped decoration: an
// edit to a name or a description was a no-op against any database that already
// had the row, and since `/api/categories` serves DB rows (the static list is
// just the no-DB fallback), production kept serving the original seed forever.
// Renaming the 社群圖鑑 theme to 物見 is the bug that found it — the code said
// 物見, production said 社群圖鑑, and nothing in between complained. Adding a
// display field to `Category` means adding it to the conflict clause too.
//
// Nothing else writes this table (only this function and `translate.ts`, which
// touches `category_translations`), so there are no hand-made edits to clobber.
//
// MUST run before word seeding so words.category never references a category
// that isn't in the table yet (the words_category_fk would reject it).
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedCategoriesIntoDb(sql: any) {
  for (const c of seedCategories) {
    await sql`
      INSERT INTO categories
        (id, name, name_zh, emoji, description, description_en, color, image_url, sort_order)
      VALUES (
        ${c.id}, ${c.name}, ${c.nameZh}, ${c.emoji},
        ${c.description}, ${c.descriptionEn ?? null}, ${c.color}, ${c.imageUrl},
        ${seedCategories.indexOf(c)}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        name_zh = EXCLUDED.name_zh,
        emoji = EXCLUDED.emoji,
        description = EXCLUDED.description,
        description_en = EXCLUDED.description_en,
        color = EXCLUDED.color,
        image_url = EXCLUDED.image_url,
        sort_order = EXCLUDED.sort_order
      WHERE (categories.name, categories.name_zh, categories.emoji,
             categories.description, categories.description_en, categories.color,
             categories.image_url, categories.sort_order)
        IS DISTINCT FROM
            (EXCLUDED.name, EXCLUDED.name_zh, EXCLUDED.emoji,
             EXCLUDED.description, EXCLUDED.description_en, EXCLUDED.color,
             EXCLUDED.image_url, EXCLUDED.sort_order)
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
  //
  // Two statements, not one, because this table carries TWO uniqueness rules:
  // the PK (word_id, category_id) and the partial index
  // word_categories_primary_uniq ON (word_id) WHERE is_primary. A single
  // `ON CONFLICT (word_id, category_id) DO NOTHING` only ever named the first
  // one, so the moment a seed word moved category the insert missed the PK
  // (different category_id) and slammed straight into the partial index:
  //   duplicate key value violates unique constraint word_categories_primary_uniq
  // That is a deploy-stopper — migrate runs inside vercel-build, so the whole
  // production build fails on a one-word category edit. It stayed invisible
  // only because no word had ever changed category before.
  //
  // Demote first so the partial index is free, then upsert; a row that already
  // exists as non-primary gets promoted rather than skipped, which is what the
  // old DO NOTHING would have gotten wrong in the other direction (leaving the
  // word with no primary at all).
  const demoted = await sql`
    UPDATE word_categories wc
       SET is_primary = FALSE
      FROM words w
     WHERE wc.word_id = w.id
       AND wc.is_primary
       AND w.category IS NOT NULL
       AND wc.category_id <> w.category
    RETURNING wc.word_id
  `;
  if (demoted.length > 0) {
    console.log(`[migrate v3] word_categories: ${demoted.length} primaries demoted (category moved)`);
  }
  const wcRes = await sql`
    INSERT INTO word_categories (word_id, category_id, is_primary)
    SELECT w.id, w.category, TRUE
    FROM words w
    WHERE w.category IS NOT NULL
    ON CONFLICT (word_id, category_id) DO UPDATE SET is_primary = TRUE
    RETURNING word_id
  `;
  console.log(`[migrate v3] word_categories: ${wcRes.length} rows upserted`);
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
/**
 * Move pre-existing manual grants out of user_entitlements and into
 * user_entitlement_grants, where they now belong.
 *
 * Before the split, a comp was written straight into the subscription row with
 * a made-up source ('manual-test-grant'). Left there it would read as a paying
 * subscriber forever — every "how many customers do we have" answer would be
 * off by the number of accounts we gave away.
 *
 * Idempotent via the granted_by = 'migration' marker.
 */
async function migrateManualGrantsOutOfSubscriptions(sql: any) {
  const moved = await sql`
    WITH manual AS (
      SELECT e.user_id, e.expires_at, e.source
        FROM user_entitlements e
       WHERE e.tier = 'pro'
         AND e.source LIKE 'manual-%'
         AND e.original_transaction_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM user_entitlement_grants g
            WHERE g.user_id = e.user_id AND g.granted_by = 'migration'
         )
    ),
    inserted AS (
      INSERT INTO user_entitlement_grants (user_id, expires_at, reason, granted_by)
      SELECT user_id,
             COALESCE(expires_at, now() + interval '365 days'),
             'migrated from user_entitlements (' || source || ')',
             'migration'
        FROM manual
      RETURNING user_id
    )
    UPDATE user_entitlements e
       SET tier = 'free', source = 'migrated-to-grant', expires_at = NULL, updated_at = now()
      FROM inserted i
     WHERE e.user_id = i.user_id
    RETURNING e.user_id
  `;
  if (moved.length > 0) {
    console.log(`[migrate] moved ${moved.length} manual grant(s) into user_entitlement_grants`);
  }
}

/**
 * Enforce "one App Store subscription entitles exactly one account".
 *
 * The device-bound Apple subscription and our app-level accounts are different
 * identities, and PaywallView re-syncs the device's entitlement to *whoever is
 * logged in* on open. So signing in with a second provider and opening the
 * paywall used to bind the same original_transaction_id to a second account,
 * leaving both Pro — and the renewal webhook then picked one of them
 * arbitrarily (LIMIT 1, no ORDER BY), so a refund could fail to reach the
 * account that was actually still entitled.
 *
 * upsertAtlasEntitlement now transfers the binding on write, but this backfill
 * makes the invariant structural. Runs de-dup FIRST because the UNIQUE index
 * would otherwise fail the build on a DB that already has duplicates.
 */
async function enforceSubscriptionBinding(sql: any) {
  // Keep the most recently updated binding; release the losers back to free.
  // They keep their entitlement history in user_entitlement_events.
  const released = await sql`
    WITH ranked AS (
      SELECT user_id, original_transaction_id,
             row_number() OVER (
               PARTITION BY original_transaction_id ORDER BY updated_at DESC, user_id
             ) AS rn
      FROM user_entitlements
      WHERE original_transaction_id IS NOT NULL
    ),
    losers AS (SELECT user_id FROM ranked WHERE rn > 1)
    UPDATE user_entitlements e
       SET tier = 'free',
           source = 'transferred',
           original_transaction_id = NULL,
           updated_at = now()
      FROM losers l
     WHERE e.user_id = l.user_id
    RETURNING e.user_id
  `;
  if (released.length > 0) {
    console.log(
      `[migrate] subscription binding: released ${released.length} duplicate account(s) to free`,
    );
    await sql`
      INSERT INTO user_entitlement_events
        (user_id, from_tier, to_tier, channel, reason, actor)
      SELECT user_id, 'pro', 'free', 'transfer',
             'migration: subscription already bound to another account', 'system'
      FROM unnest(${released.map((r: { user_id: string }) => r.user_id)}::uuid[]) AS user_id
    `;
  }

  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS user_entitlements_original_txn_uniq
      ON user_entitlements(original_transaction_id)
      WHERE original_transaction_id IS NOT NULL
  `);
  // The old non-unique index is now redundant — the UNIQUE one serves the
  // webhook's txn -> user lookup.
  await sql.unsafe(`DROP INDEX IF EXISTS user_entitlements_original_txn_idx`);
  console.log(`[migrate] subscription binding: unique constraint ensured.`);
}

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
      target_language   TEXT NOT NULL DEFAULT 'en',
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
  await sql.unsafe(`
    CREATE INDEX study_logs_user_language_created_idx
      ON study_logs (user_id, target_language, created_at DESC)
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
  // One-time + idempotent cleanup of the pre-image-en deck world.
  // - DELETE wipes the three legacy decks; FK CASCADE on user_cards.card_id
  //   removes the matching SRS state. Subsequent deploys find no matching
  //   rows and become a true no-op (deleted=0).
  // - UPDATE clears any user_settings.study_decks that still pins one of
  //   the legacy deck keys; without this, those users' /study queue would
  //   filter to an empty set.
  const dropped = await sql`
    DELETE FROM cards
    WHERE deck_key IN ('recall-zh-en','recall-en-zh','cloze-1')
    RETURNING id
  `;
  if (dropped.length > 0) {
    console.log(`[migrate] cards: dropped ${dropped.length} legacy deck rows (+CASCADE user_cards)`);
  }
  const settingsReset = await sql`
    UPDATE user_settings
       SET study_decks = '[]'::jsonb
     WHERE study_decks IS NOT NULL
       AND (study_decks::text LIKE '%recall-zh-en%'
         OR study_decks::text LIKE '%recall-en-zh%'
         OR study_decks::text LIKE '%cloze-1%')
    RETURNING user_id
  `;
  if (settingsReset.length > 0) {
    console.log(
      `[migrate] user_settings: cleared legacy deck filter for ${settingsReset.length} user(s)`,
    );
  }

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

  // The canonical English term is the existing words.word value. Japanese
  // terms are initially backfilled from the curated ja definition overlay;
  // administrators can later refine reading/pronunciation independently
  // without changing the underlying concept or English content.
  await sql`
    INSERT INTO word_terms (word_id, language, term, pronunciation)
    SELECT id, 'en', word, pronunciation
    FROM words
    WHERE deleted_at IS NULL
    ON CONFLICT (word_id, language) DO UPDATE SET
      term = EXCLUDED.term,
      pronunciation = EXCLUDED.pronunciation,
      updated_at = now()
  `;
  await sql`
    INSERT INTO word_terms (word_id, language, term)
    SELECT DISTINCT ON (d.word_id)
      d.word_id, 'ja', d.definition
    FROM word_definitions d
    JOIN words w ON w.id = d.word_id
    WHERE d.language = 'ja'
      AND btrim(d.definition) <> ''
      AND w.deleted_at IS NULL
      AND w.status = 'published'
    ORDER BY d.word_id, d.sort_order
    ON CONFLICT (word_id, language) DO NOTHING
  `;

  const jaInserted = await sql`
    INSERT INTO cards (word_id, card_type, front, back, explanation, tags, deck_key)
    SELECT
      wt.word_id,
      '回想卡',
      '',
      wt.term,
      concat_ws(' ', wt.term, NULLIF(wt.reading, '')),
      ARRAY['image','ja']::text[],
      'image-ja'
    FROM word_terms wt
    JOIN words w ON w.id = wt.word_id
    WHERE wt.language = 'ja'
      AND w.deleted_at IS NULL
      AND w.status = 'published'
    ON CONFLICT (word_id, deck_key) DO UPDATE SET
      back = EXCLUDED.back,
      explanation = EXCLUDED.explanation,
      tags = EXCLUDED.tags
    RETURNING id
  `;
  console.log(`[migrate] japanese cards: ${jaInserted.length} inserted or refreshed`);
  console.log(`[migrate] cards: ${inserted} inserted, ${skipped} already existed`);
}

// Push seed imageUrl edits to existing rows. seedV2 only ever sees words
// missing from the DB, so without this step editing an imageUrl in
// lib/words.ts / supplemental-words.json would silently do nothing.
//
// Guard: a row whose image already lives in our Supabase Storage bucket
// (migrated by scripts/upload-images.ts or uploaded via admin) is never
// reverted to a non-Storage URL — the seed file usually still holds the
// original hotlink, and every deploy runs this. Pointing the seed at a new
// Storage URL, or editing a word still on an external URL, does propagate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncSeedWordImages(sql: any) {
  const seeded = seedWords.filter((w) => w.imageUrl);
  const ids = seeded.map((w) => w.id);
  const urls = seeded.map((w) => w.imageUrl);
  const updated = await sql`
    UPDATE words w
    SET image_url = s.image_url
    FROM unnest(${ids}::text[], ${urls}::text[]) AS s(id, image_url)
    WHERE w.id = s.id
      AND w.image_url IS DISTINCT FROM s.image_url
      AND (
        w.image_url IS NULL
        OR w.image_url NOT LIKE '%/storage/v1/object/public/word-images/%'
        OR s.image_url LIKE '%/storage/v1/object/public/word-images/%'
      )
    RETURNING w.id
  `;
  if (updated.length > 0) {
    console.log(
      `[migrate] image_url synced from seed: ${updated.map((r: { id: string }) => r.id).join(", ")}`,
    );
  } else {
    console.log(`[migrate] image_url: no seed changes to sync.`);
  }
}

async function main() {
  // Skip schema migration on non-production Vercel builds (preview /
  // development). The preview build environment can't reach the production DB,
  // so running migrate there only fails the build. Production deploys still
  // run it, and so does a local `npm run migrate` (VERCEL_ENV is unset).
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv && vercelEnv !== "production") {
    console.log(`[migrate] VERCEL_ENV=${vercelEnv} — skipping migrate on non-production build.`);
    return;
  }

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
      // New words are expected to ship a Supabase Storage image (loremflickr
      // and other hotlinks are retired — WORD_IMPORT.md §6). Warn, don't fail:
      // a content slip shouldn't block a prod deploy.
      const badImg = missing.filter(
        (w) => !w.imageUrl || !w.imageUrl.includes("/storage/v1/object/public/word-images/"),
      );
      if (badImg.length > 0) {
        console.warn(
          `[migrate] WARNING: ${badImg.length} new word(s) without a Storage image: ${badImg
            .map((w) => w.id)
            .join(", ")}`,
        );
      }
      await seedV2(sql, missing);
      console.log(`[migrate] seed complete.`);
    }

    // Runs against ALL seed words (not just missing ones) so image edits in
    // the seed files reach rows that already exist.
    await syncSeedWordImages(sql);

    await generateCards(sql);
    const correctedWords = await applyMainWordCorrections(sql);
    console.log(`[migrate] main-word corrections checked (${correctedWords} rows).`);
    await backfillSchemaV2(sql);
    await backfillSchemaV3(sql);
    await moderateExistingProfileNicknames(sql);
    await migrateManualGrantsOutOfSubscriptions(sql);
    await enforceSubscriptionBinding(sql);
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
