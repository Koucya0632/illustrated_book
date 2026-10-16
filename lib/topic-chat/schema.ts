import type postgres from "postgres";

/**
 * 圖鑑主題對話's tables (docs/ATLAS_AI_CONVERSATION_DESIGN.md §9.3).
 *
 * - `topic_chats` — one saved conversation. Its learning direction never
 *   changes; its topic does, and every change bumps `topic_version`, which is
 *   what makes a reply started under the old topic unable to land.
 * - `topic_chat_messages` — what the person reads: AI turns, their answers and
 *   the topic dividers. An answer and the reply to it are written together, so
 *   a failed or stopped reply leaves no orphaned answer behind.
 * - `topic_chat_requests` — one row per generation, keyed by the client's
 *   request id. The status is how the server, not the order responses reach
 *   the phone, decides between "the reply was committed" and "it was stopped,
 *   switched away from, or deleted". At most one chat-changing generation is
 *   pending per conversation.
 *
 * Deleting a chat cascades to both, and deleting the account to the chat.
 */
export const TOPIC_CHAT_TABLES = ["topic_chats", "topic_chat_messages", "topic_chat_requests"] as const;

export const TOPIC_CHAT_DDL = [
  `CREATE TABLE IF NOT EXISTS topic_chats (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    learning_direction TEXT NOT NULL CHECK (learning_direction IN ('zh-en', 'zh-ja')),
    topic_id TEXT NOT NULL,
    topic_version INT NOT NULL DEFAULT 1 CHECK (topic_version >= 1),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
    created_request_id UUID NOT NULL UNIQUE,
    review JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ
  )`,
  // One conversation to continue per learning direction.
  `CREATE UNIQUE INDEX IF NOT EXISTS topic_chats_one_active_idx
    ON topic_chats(user_id, learning_direction) WHERE status = 'active'`,
  `CREATE INDEX IF NOT EXISTS topic_chats_user_idx ON topic_chats(user_id, learning_direction, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS topic_chat_messages (
    id UUID PRIMARY KEY,
    chat_id UUID NOT NULL REFERENCES topic_chats(id) ON DELETE CASCADE,
    seq BIGINT GENERATED ALWAYS AS IDENTITY,
    kind TEXT NOT NULL CHECK (kind IN ('ai', 'user', 'topic')),
    topic_id TEXT NOT NULL,
    topic_version INT NOT NULL,
    request_id UUID NOT NULL,
    body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chat_id, request_id, kind)
  )`,
  `CREATE INDEX IF NOT EXISTS topic_chat_messages_chat_idx ON topic_chat_messages(chat_id, seq)`,
  `CREATE TABLE IF NOT EXISTS topic_chat_requests (
    request_id UUID PRIMARY KEY,
    chat_id UUID NOT NULL REFERENCES topic_chats(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('opening', 'reply', 'another', 'simplify', 'express', 'review')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'committed', 'failed', 'stopped', 'stale')),
    topic_version INT NOT NULL,
    anchor_message_id UUID,
    payload JSONB,
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  // The backend's half of "one reply at a time"; the app's disabled button is the other.
  `CREATE UNIQUE INDEX IF NOT EXISTS topic_chat_requests_one_pending_idx
    ON topic_chat_requests(chat_id) WHERE status = 'pending' AND kind IN ('opening', 'reply', 'another', 'simplify')`,
  `CREATE INDEX IF NOT EXISTS topic_chat_requests_chat_idx ON topic_chat_requests(chat_id, created_at)`,
  ...TOPIC_CHAT_TABLES.map(table => `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`),
] as const;

/** Requires auth.users. */
export async function migrateTopicChatSchema(sql: postgres.Sql): Promise<void> {
  await sql.begin(async tx => {
    for (const statement of TOPIC_CHAT_DDL) await tx.unsafe(statement);
  });
}
