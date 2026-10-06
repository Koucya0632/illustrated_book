import type postgres from "postgres";

export const AI_OPERATION_TABLES = ["ai_quotes", "ai_operations", "ai_operation_attempts", "atlas_capacity_reservations", "ai_fulfillments", "ai_fulfillment_attempts", "credit_image_uploads"] as const;
export const AI_OPERATION_DDL = [
  `CREATE TABLE IF NOT EXISTS ai_quotes (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    environment TEXT NOT NULL,
    input JSONB NOT NULL CHECK (jsonb_typeof(input) = 'object'),
    image_sha256 TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    points INT NOT NULL CHECK (points > 0),
    price_version TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY (user_id, environment) REFERENCES credit_accounts ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS ai_operations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    environment TEXT NOT NULL,
    quote_id UUID NOT NULL UNIQUE REFERENCES ai_quotes,
    idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
    request_hash TEXT NOT NULL,
    image_id UUID NOT NULL,
    job_id UUID NOT NULL,
    input JSONB NOT NULL CHECK (jsonb_typeof(input) = 'object'),
    image_sha256 TEXT NOT NULL,
    requires_slot BOOLEAN NOT NULL,
    points INT NOT NULL CHECK (points > 0),
    price_version TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('reserved','running','reconciling','committed','released')),
    attempt INT NOT NULL DEFAULT 0 CHECK (attempt >= 0),
    lease_token UUID,
    lease_until TIMESTAMPTZ,
    reconcile_until TIMESTAMPTZ NOT NULL,
    staged_result JSONB,
    result JSONB,
    failure_code TEXT,
    confirmed_candidate_id UUID,
    confirmed_item_id UUID,
    fulfillment_state TEXT NOT NULL DEFAULT 'unclaimed' CHECK (fulfillment_state IN ('unclaimed','pending')),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (user_id, environment, idempotency_key),
    UNIQUE (id, user_id, environment),
    FOREIGN KEY (user_id, environment) REFERENCES credit_accounts ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ai_operations_active_image_idx
    ON ai_operations(user_id, image_id) WHERE state IN ('reserved','running','reconciling')`,
  `CREATE INDEX IF NOT EXISTS ai_operations_work_idx ON ai_operations(environment, state, created_at)
    WHERE state IN ('reserved','running','reconciling')`,
  `CREATE TABLE IF NOT EXISTS ai_operation_attempts (
    operation_id UUID NOT NULL REFERENCES ai_operations ON DELETE CASCADE,
    attempt INT NOT NULL,
    token UUID NOT NULL UNIQUE,
    started_at TIMESTAMPTZ NOT NULL,
    lease_until TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    outcome TEXT CHECK (outcome IN ('committed','released','reconciling')),
    usage JSONB,
    PRIMARY KEY (operation_id, attempt)
  )`,
  `CREATE TABLE IF NOT EXISTS atlas_capacity_reservations (
    operation_id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    environment TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY (operation_id, user_id, environment) REFERENCES ai_operations(id, user_id, environment) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS atlas_capacity_live_idx ON atlas_capacity_reservations(user_id, expires_at)`,
  `ALTER TABLE ai_operations DROP CONSTRAINT IF EXISTS ai_operations_fulfillment_state_check`,
  `ALTER TABLE ai_operations ADD CONSTRAINT ai_operations_fulfillment_state_check
    CHECK (fulfillment_state IN ('unclaimed','pending','running','reconciling','completed','compensated','superseded'))`,
  // The name the user confirmed (possibly corrected); the included supplement belongs to that name.
  `ALTER TABLE ai_operations ADD COLUMN IF NOT EXISTS confirmed_lemma TEXT`,
  `CREATE TABLE IF NOT EXISTS ai_fulfillments (
    operation_id UUID PRIMARY KEY REFERENCES ai_operations ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (state IN ('pending','running','reconciling','completed','compensated','superseded')),
    attempt INT NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 3),
    lease_token UUID, lease_until TIMESTAMPTZ, next_attempt_at TIMESTAMPTZ NOT NULL,
    deadline_at TIMESTAMPTZ NOT NULL, staged_result JSONB, failure_code TEXT,
    created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ai_fulfillments_work_idx ON ai_fulfillments(next_attempt_at)
    WHERE state IN ('pending','running','reconciling')`,
  `CREATE TABLE IF NOT EXISTS ai_fulfillment_attempts (
    operation_id UUID NOT NULL REFERENCES ai_fulfillments ON DELETE CASCADE,
    attempt INT NOT NULL, token UUID NOT NULL UNIQUE, started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ, outcome TEXT, usage JSONB,
    PRIMARY KEY (operation_id, attempt)
  )`,
  `INSERT INTO ai_fulfillments (operation_id, state, next_attempt_at, deadline_at, created_at, updated_at)
    SELECT id, 'pending', updated_at, updated_at + INTERVAL '24 hours', updated_at, updated_at
    FROM ai_operations WHERE state = 'committed' AND fulfillment_state = 'pending' AND confirmed_item_id IS NOT NULL
    ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS credit_image_uploads (
    id UUID PRIMARY KEY, user_id UUID NOT NULL, environment TEXT NOT NULL,
    sha256 TEXT NOT NULL, byte_size INT NOT NULL CHECK (byte_size > 0),
    width INT NOT NULL CHECK (width > 0), height INT NOT NULL CHECK (height > 0),
    original_path TEXT NOT NULL, thumb_path TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending','ready','cleanup','cleaned')),
    lease_until TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY (user_id, environment) REFERENCES credit_accounts ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS credit_image_uploads_hash_idx ON credit_image_uploads(user_id, sha256)
    WHERE state IN ('pending','cleanup')`,
  ...AI_OPERATION_TABLES.map(table => `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`),
] as const;

export async function migrateAiOperationsSchema(sql: postgres.Sql): Promise<void> {
  await sql.begin(async tx => {
    for (const statement of AI_OPERATION_DDL) await tx.unsafe(statement);
  });
}
