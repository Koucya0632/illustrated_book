import type postgres from "postgres";

/** Additive DDL; no client policies. Only the server database role may write. */
export const CREDIT_TABLES = [
  "credit_accounts", "credit_user_policies", "credit_lots", "credit_ledger",
  "credit_benefit_claims", "credit_reservations", "credit_operation_allocations", "credit_compensations",
  "credit_store_transactions", "credit_store_notifications",
  "credit_policy_events",
  "credit_refund_resolutions",
  "credit_admin_grants",
] as const;

/** Tables and RLS become visible in the same commit, including on fresh installs. */
export async function migrateCreditSchema(sql: postgres.Sql): Promise<void> {
  await sql.begin(async tx => {
    for (const statement of CREDIT_DDL) await tx.unsafe(statement);
  });
}

export const CREDIT_DDL = [
  `CREATE TABLE IF NOT EXISTS credit_accounts (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    environment TEXT NOT NULL CHECK (environment IN ('production','sandbox')),
    wallet_version BIGINT NOT NULL DEFAULT 0 CHECK (wallet_version >= 0),
    PRIMARY KEY (user_id, environment)
  )`,
  `CREATE TABLE IF NOT EXISTS credit_user_policies (
    user_id UUID NOT NULL,
    environment TEXT NOT NULL,
    billing_mode TEXT NOT NULL CHECK (billing_mode IN ('legacy','credits')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, environment),
    FOREIGN KEY (user_id, environment) REFERENCES credit_accounts ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS credit_policy_events (
    user_id UUID NOT NULL, environment TEXT NOT NULL, policy_version TEXT NOT NULL,
    previous_mode TEXT NOT NULL CHECK (previous_mode IN ('legacy','credits')),
    billing_mode TEXT NOT NULL CHECK (billing_mode = 'credits'),
    actor TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, environment, policy_version),
    FOREIGN KEY (user_id, environment) REFERENCES credit_accounts ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS credit_lots (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    environment TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('monthly','check_in','purchase','adjustment')),
    grant_key TEXT NOT NULL CHECK (char_length(grant_key) BETWEEN 1 AND 200),
    issued INT NOT NULL CHECK (issued > 0),
    remaining INT NOT NULL,
    reserved INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    CHECK (0 <= reserved AND reserved <= remaining AND remaining <= issued),
    CHECK (source <> 'purchase' OR expires_at IS NULL),
    UNIQUE (user_id, environment, grant_key),
    UNIQUE (id, user_id, environment),
    FOREIGN KEY (user_id, environment) REFERENCES credit_accounts ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS credit_lots_wallet_idx ON credit_lots(user_id, environment)
    WHERE remaining > 0`,
  `CREATE TABLE IF NOT EXISTS credit_ledger (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    environment TEXT NOT NULL,
    wallet_version BIGINT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('grant','reserve','commit','release','expire')),
    amount INT NOT NULL,
    reserved_delta INT NOT NULL,
    reference TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (user_id, environment, wallet_version),
    FOREIGN KEY (user_id, environment) REFERENCES credit_accounts ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS credit_ledger_wallet_idx
    ON credit_ledger(user_id, environment, id DESC)`,
  `CREATE TABLE IF NOT EXISTS credit_benefit_claims (
    user_id UUID NOT NULL,
    environment TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('monthly','check_in')),
    period TEXT NOT NULL,
    month TEXT NOT NULL,
    amount INT NOT NULL CHECK (amount >= 0),
    policy_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, environment, kind, period),
    FOREIGN KEY (user_id, environment) REFERENCES credit_accounts ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS credit_benefits_month_idx
    ON credit_benefit_claims(user_id, environment, kind, month)`,
  `CREATE TABLE IF NOT EXISTS credit_reservations (
    user_id UUID NOT NULL,
    environment TEXT NOT NULL,
    operation_key TEXT NOT NULL CHECK (char_length(operation_key) BETWEEN 1 AND 200),
    amount INT NOT NULL CHECK (amount > 0),
    state TEXT NOT NULL CHECK (state IN ('reserved','committed','released')),
    created_at TIMESTAMPTZ NOT NULL,
    settled_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, environment, operation_key),
    FOREIGN KEY (user_id, environment) REFERENCES credit_accounts ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS credit_operation_allocations (
    user_id UUID NOT NULL,
    environment TEXT NOT NULL,
    operation_key TEXT NOT NULL,
    lot_id BIGINT NOT NULL,
    amount INT NOT NULL CHECK (amount > 0),
    PRIMARY KEY (user_id, environment, operation_key, lot_id),
    FOREIGN KEY (user_id, environment, operation_key) REFERENCES credit_reservations ON DELETE CASCADE,
    FOREIGN KEY (lot_id, user_id, environment) REFERENCES credit_lots(id, user_id, environment)
  )`,
  `CREATE TABLE IF NOT EXISTS credit_compensations (
    user_id UUID NOT NULL, environment TEXT NOT NULL, operation_key TEXT NOT NULL,
    amount INT NOT NULL CHECK (amount > 0), created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, environment, operation_key),
    FOREIGN KEY (user_id, environment, operation_key) REFERENCES credit_reservations ON DELETE CASCADE
  )`,
  `ALTER TABLE credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_kind_check`,
  `ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_kind_check
    CHECK (kind IN ('grant','reserve','commit','release','expire','compensate','refund','refund_reverse'))`,
  `CREATE TABLE IF NOT EXISTS credit_store_transactions (
    environment TEXT NOT NULL, transaction_id TEXT NOT NULL, user_id UUID NOT NULL,
    product_id TEXT NOT NULL, quantity INT NOT NULL CHECK (quantity > 0),
    points INT NOT NULL CHECK (points > 0), catalog_version TEXT NOT NULL,
    lot_id BIGINT, last_event_at TIMESTAMPTZ NOT NULL,
    refund_points INT NOT NULL DEFAULT 0, withdrawn_points INT NOT NULL DEFAULT 0,
    consumed_points INT NOT NULL DEFAULT 0,
    CHECK (0 <= withdrawn_points AND withdrawn_points <= refund_points AND refund_points <= points),
    CHECK (0 <= consumed_points AND consumed_points <= refund_points - withdrawn_points),
    PRIMARY KEY (environment, transaction_id),
    FOREIGN KEY (user_id, environment) REFERENCES credit_accounts ON DELETE CASCADE,
    FOREIGN KEY (lot_id, user_id, environment) REFERENCES credit_lots(id, user_id, environment)
  )`,
  `CREATE TABLE IF NOT EXISTS credit_store_notifications (
    environment TEXT NOT NULL CHECK (environment IN ('production','sandbox')),
    notification_id UUID NOT NULL, payload_hash TEXT NOT NULL, payload JSONB NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processed','ignored')),
    attempts INT NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL, processed_at TIMESTAMPTZ,
    PRIMARY KEY (environment, notification_id)
  )`,
  `CREATE INDEX IF NOT EXISTS credit_store_refunds_idx ON credit_store_transactions(user_id, environment)
    WHERE refund_points > withdrawn_points`,
  `CREATE TABLE IF NOT EXISTS credit_refund_resolutions (
    user_id UUID NOT NULL, environment TEXT NOT NULL, request_key UUID NOT NULL,
    transaction_id TEXT NOT NULL, refund_event_at TIMESTAMPTZ NOT NULL,
    refund_points INT NOT NULL CHECK (refund_points > 0),
    resolved_points INT NOT NULL CHECK (resolved_points > 0 AND resolved_points <= refund_points),
    reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
    actor TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, environment, request_key),
    UNIQUE (environment, transaction_id, refund_event_at, refund_points),
    FOREIGN KEY (user_id, environment) REFERENCES credit_accounts ON DELETE CASCADE,
    FOREIGN KEY (environment, transaction_id) REFERENCES credit_store_transactions ON DELETE CASCADE
  )`,
  `ALTER TABLE credit_store_notifications ADD COLUMN IF NOT EXISTS signed_payload TEXT`,
  `CREATE TABLE IF NOT EXISTS credit_admin_grants (
    user_id UUID NOT NULL, environment TEXT NOT NULL, request_key UUID NOT NULL,
    lot_id BIGINT NOT NULL, amount INT NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
    actor TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, environment, request_key),
    FOREIGN KEY (lot_id, user_id, environment) REFERENCES credit_lots(id, user_id, environment) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS credit_store_notifications_work_idx ON credit_store_notifications(next_attempt_at)
    WHERE state = 'pending'`,
  ...CREDIT_TABLES.map(table => `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`),
] as const;
