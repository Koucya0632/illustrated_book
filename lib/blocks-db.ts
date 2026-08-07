// 封鎖 — one-way "never show me this author again".
//
// Kept out of atlas-db.ts because a block is a relation between two *users*,
// not an atlas object; the atlas is merely where the effect is visible today.
//
// The unit of exchange with the client is the **handle** (`profiles.username`,
// the immutable TJ-UID), not the user id: the public payloads iOS already holds
// carry `author.handle` and nothing else, and a handle cannot be reassigned, so
// there is nothing to keep in sync.

import { getSql } from "./db";

function requireSql() {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  return sql;
}

/** Handles this user has blocked, newest first. */
export async function listBlockedHandles(userId: string): Promise<string[]> {
  const sql = requireSql();
  const rows = await sql<{ username: string }[]>`
    SELECT p.username
    FROM user_blocks b
    JOIN profiles p ON p.id = b.blocked_user_id
    WHERE b.blocker_user_id = ${userId}::uuid
    ORDER BY b.created_at DESC
    LIMIT 500
  `;
  return rows.map((r) => r.username).filter(Boolean);
}

export type BlockOutcome = "ok" | "already" | "not_found" | "self";

export async function blockHandle(
  userId: string,
  handle: string,
): Promise<BlockOutcome> {
  const sql = requireSql();
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM profiles WHERE username = ${handle} LIMIT 1
  `;
  const target = rows[0]?.id;
  if (!target) return "not_found";
  if (target === userId) return "self";

  const inserted = await sql<{ blocked_user_id: string }[]>`
    INSERT INTO user_blocks (blocker_user_id, blocked_user_id)
    VALUES (${userId}::uuid, ${target}::uuid)
    ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING
    RETURNING blocked_user_id
  `;
  return inserted.length > 0 ? "ok" : "already";
}

/** Idempotent: unblocking someone who was never blocked is a no-op, not a 404. */
export async function unblockHandle(userId: string, handle: string): Promise<void> {
  const sql = requireSql();
  await sql`
    DELETE FROM user_blocks
    WHERE blocker_user_id = ${userId}::uuid
      AND blocked_user_id = (SELECT id FROM profiles WHERE username = ${handle})
  `;
}
