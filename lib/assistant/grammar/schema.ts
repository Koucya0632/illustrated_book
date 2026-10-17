import type postgres from "postgres";
import { onlyIf } from "../../ddl";

export const GRAMMAR_TABLES = ["assistant_grammar_requests"] as const;
export const GRAMMAR_DDL = [
  `CREATE TABLE IF NOT EXISTS assistant_grammar_requests (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
    request_id UUID NOT NULL,
    fingerprint TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('explain', 'compare', 'practice')),
    ui_language TEXT NOT NULL,
    learning_direction TEXT NOT NULL,
    source_record_id UUID,
    input JSONB,
    result JSONB,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'clarification', 'failed', 'deleted')),
    charged INT NOT NULL DEFAULT 0 CHECK (charged >= 0 AND charged <= 20),
    favorite BOOLEAN NOT NULL DEFAULT false,
    template_version TEXT NOT NULL,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deadline TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, environment, request_id)
  )`,
  `CREATE INDEX IF NOT EXISTS assistant_grammar_direction_history_idx ON assistant_grammar_requests
    (user_id, environment, learning_direction, created_at DESC, request_id DESC)
    WHERE status = 'completed'`,
  onlyIf(`NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'assistant_grammar_requests'::regclass)`,
    `ALTER TABLE assistant_grammar_requests ENABLE ROW LEVEL SECURITY`),
] as const;
export async function migrateGrammarSchema(sql: postgres.Sql) {
  await sql.begin(async tx => { for (const ddl of GRAMMAR_DDL) await tx.unsafe(ddl); });
}
