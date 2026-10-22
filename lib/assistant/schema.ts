import type postgres from "postgres";
import { onlyIf } from "../ddl";

/**
 * One row per answer the model produced — what it used and what was charged.
 *
 * The points ledger already records each charge; this is the other half: the
 * tokens behind it. Answers that were not charged (out of scope, a lost race,
 * a resend) are rows too, because they cost the same to produce.
 *
 * It is the 用量紀錄 of every paid AI feature, not only 助手's: 拍照做卡 writes
 * one row per 識別操作 (`capture`, lib/ai-operations/usage.ts), so 實際倍率 is
 * read from one place. A deleted account's rows stay, with `user_id` cleared
 * (tuji-ios docs/adr/0018).
 */
const FEATURES = ["ask", "story", "chat", "vocabulary", "grammar", "capture"];
const KEEP_ON_DELETE = "FOREIGN KEY (user_id, environment) REFERENCES credit_accounts ON DELETE SET NULL (user_id)";
export const ASSISTANT_TABLES = ["assistant_usage"] as const;
export const ASSISTANT_DDL = [
  `CREATE TABLE IF NOT EXISTS assistant_usage (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id UUID NOT NULL,
    user_id UUID,
    environment TEXT NOT NULL,
    model TEXT NOT NULL,
    in_scope BOOLEAN NOT NULL,
    input_tokens INT NOT NULL CHECK (input_tokens >= 0),
    output_tokens INT NOT NULL CHECK (output_tokens >= 0),
    cache_read_tokens INT NOT NULL DEFAULT 0 CHECK (cache_read_tokens >= 0),
    cache_write_tokens INT NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
    estimated_cost_usd NUMERIC(12, 6) NOT NULL CHECK (estimated_cost_usd >= 0),
    points_charged INT NOT NULL CHECK (points_charged >= 0),
    pricing_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    ${KEEP_ON_DELETE}
  )`,
  // 情境故事 shares the table; rows written before it existed are 問 AI.
  `ALTER TABLE assistant_usage ADD COLUMN IF NOT EXISTS feature TEXT NOT NULL DEFAULT 'ask'
    CHECK (feature IN ('ask', 'story'))`,
  // 主題對話 (lib/topic-chat) writes rows here too.
  onlyIf(`NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'assistant_usage'::regclass
      AND conname = 'assistant_usage_feature_check'
      AND pg_get_constraintdef(oid) LIKE ALL (ARRAY[${FEATURES.map(f => `'%''${f}''%'`).join(",")}]))`,
    `ALTER TABLE assistant_usage DROP CONSTRAINT IF EXISTS assistant_usage_feature_check`,
    `ALTER TABLE assistant_usage ADD CONSTRAINT assistant_usage_feature_check
      CHECK (feature IN (${FEATURES.map(f => `'${f}'`).join(", ")}))`),
  // Tables made before 0018 took a deleted account's rows with it.
  onlyIf(`EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'assistant_usage'::regclass
      AND attname = 'user_id' AND attnotnull)`,
    `ALTER TABLE assistant_usage ALTER COLUMN user_id DROP NOT NULL`),
  onlyIf(`NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'assistant_usage'::regclass
      AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%ON DELETE SET NULL (user_id)%')`,
    `ALTER TABLE assistant_usage DROP CONSTRAINT IF EXISTS assistant_usage_user_id_environment_fkey`,
    `ALTER TABLE assistant_usage ADD CONSTRAINT assistant_usage_user_id_environment_fkey ${KEEP_ON_DELETE}`),
  // A 識別操作's row is recomputed at each settlement, so it has exactly one.
  `CREATE UNIQUE INDEX IF NOT EXISTS assistant_usage_capture_idx ON assistant_usage(request_id) WHERE feature = 'capture'`,
  `CREATE INDEX IF NOT EXISTS assistant_usage_time_idx ON assistant_usage(environment, created_at)`,
  `CREATE INDEX IF NOT EXISTS assistant_usage_user_idx ON assistant_usage(user_id, environment, created_at)`,
  ...ASSISTANT_TABLES.map(table => onlyIf(`NOT (SELECT relrowsecurity FROM pg_class WHERE oid = '${table}'::regclass)`,
    `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)),
] as const;

/** Requires the credit schema: usage rows belong to a credit account. */
export async function migrateAssistantSchema(sql: postgres.Sql): Promise<void> {
  await sql.begin(async tx => {
    for (const statement of ASSISTANT_DDL) await tx.unsafe(statement);
  });
}
