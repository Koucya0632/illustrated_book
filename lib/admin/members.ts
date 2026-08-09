// Read model for /admin/members — the operator's answer to "what is this
// person's actual Pro state, and why".
//
// Exists because App Store Connect cannot answer that question: it knows Apple
// transactions, not Tuji user ids. Everything here is admin-only and joins
// auth.users, so it must never be imported by a user-facing route.
//
// Lookup accepts BOTH email and TJ UID on purpose. 5 of our 6 Apple sign-ins
// have @privaterelay.appleid.com addresses, so a support mail arriving from
// someone's real inbox can only be matched by the UID they read off their 我的
// page — email-only lookup silently fails for exactly those users.

import "server-only";
import { getSql } from "@/lib/db";
import {
  getAtlasUsage,
  resolveEntitlement,
  type AtlasTier,
  type AtlasUsage,
  type EffectiveEntitlement,
} from "@/lib/atlas/entitlement";

export interface MemberSummary {
  userId: string;
  username: string;
  nickname: string | null;
  email: string;
  createdAt: string;
  tier: AtlasTier;
  expiresAt: string | null;
  /** True when Pro comes (at least partly) from a manual grant. */
  hasGrant: boolean;
  /** True when a live App Store subscription is present. */
  hasSubscription: boolean;
}

export interface MemberGrant {
  id: string;
  expiresAt: string;
  reason: string;
  grantedBy: string;
  grantedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface MemberLedgerEntry {
  id: string;
  fromTier: string | null;
  toTier: string;
  fromExpiresAt: string | null;
  toExpiresAt: string | null;
  channel: string;
  reason: string | null;
  actor: string;
  createdAt: string;
}

export interface MemberSubscription {
  tier: string;
  source: string | null;
  expiresAt: string | null;
  originalTransactionId: string | null;
  updatedAt: string;
}

export interface MemberDetail {
  summary: MemberSummary;
  effective: EffectiveEntitlement;
  subscription: MemberSubscription | null;
  grants: MemberGrant[];
  ledger: MemberLedgerEntry[];
  usage: AtlasUsage;
}

interface MemberRow {
  id: string;
  username: string;
  nickname: string | null;
  email: string | null;
  created_at: string;
  sub_tier: string | null;
  sub_expires_at: string | null;
  grant_expires_at: string | null;
}

function toSummary(row: MemberRow): MemberSummary {
  const effective = resolveEntitlement(row);
  return {
    userId: row.id,
    username: row.username,
    nickname: row.nickname,
    email: row.email ?? "",
    createdAt: row.created_at,
    tier: effective.tier,
    expiresAt: effective.expiresAt,
    hasGrant: effective.grantExpiresAt !== null,
    hasSubscription:
      effective.tier === "pro" &&
      row.sub_tier === "pro" &&
      (effective.subscriptionExpiresAt === null ||
        new Date(effective.subscriptionExpiresAt).getTime() > Date.now()),
  };
}

/**
 * Search members by TJ UID, email or nickname. An empty query lists everyone,
 * Pro first — at this scale that IS the member list, and Pro floating to the
 * top keeps it useful as the account count grows.
 */
export async function searchMembers(
  query: string,
  options: { proOnly?: boolean; limit?: number } = {},
): Promise<MemberSummary[]> {
  const sql = getSql();
  if (!sql) throw new Error("database unavailable");
  const q = query.trim();
  const pattern = q ? `%${q}%` : "";
  const proOnly = options.proOnly ?? false;
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

  const rows = (await sql`
    SELECT p.id, p.username, p.nickname, u.email, p.created_at,
           e.tier       AS sub_tier,
           e.expires_at AS sub_expires_at,
           g.expires_at AS grant_expires_at
      FROM profiles p
      JOIN auth.users u ON u.id = p.id
      LEFT JOIN user_entitlements e ON e.user_id = p.id
      LEFT JOIN LATERAL (
        SELECT max(expires_at) AS expires_at
          FROM user_entitlement_grants
         WHERE user_id = p.id AND revoked_at IS NULL AND expires_at > now()
      ) g ON TRUE
     WHERE (${pattern} = '' OR p.username ILIKE ${pattern}
                            OR u.email ILIKE ${pattern}
                            OR p.nickname ILIKE ${pattern})
       AND (NOT ${proOnly} OR (
             g.expires_at IS NOT NULL
             OR (e.tier = 'pro' AND (e.expires_at IS NULL OR e.expires_at > now()))
           ))
     ORDER BY (
       g.expires_at IS NOT NULL
       OR (e.tier = 'pro' AND (e.expires_at IS NULL OR e.expires_at > now()))
     ) DESC, p.created_at DESC
     LIMIT ${limit}
  `) as MemberRow[];

  return rows.map(toSummary);
}

/** Resolve a TJ UID (or a raw user id) to a user id, or null. */
export async function resolveMemberId(handle: string): Promise<string | null> {
  const sql = getSql();
  if (!sql) throw new Error("database unavailable");
  const value = handle.trim();
  if (!value) return null;
  const rows = (await sql`
    SELECT id FROM profiles
     WHERE lower(username) = lower(${value})
        OR id::text = ${value}
     LIMIT 1
  `) as { id: string }[];
  return rows[0]?.id ?? null;
}

/**
 * Everything the operator needs on one screen: the subscription and the grants
 * shown SEPARATELY (never merged into a single "Pro until…"), because the whole
 * point of splitting them is being able to see which one is carrying the user.
 */
export async function getMemberDetail(userId: string): Promise<MemberDetail | null> {
  const sql = getSql();
  if (!sql) throw new Error("database unavailable");

  const [rows, subs, grants, ledger, usage] = await Promise.all([
    sql`
      SELECT p.id, p.username, p.nickname, u.email, p.created_at,
             e.tier       AS sub_tier,
             e.expires_at AS sub_expires_at,
             g.expires_at AS grant_expires_at
        FROM profiles p
        JOIN auth.users u ON u.id = p.id
        LEFT JOIN user_entitlements e ON e.user_id = p.id
        LEFT JOIN LATERAL (
          SELECT max(expires_at) AS expires_at
            FROM user_entitlement_grants
           WHERE user_id = p.id AND revoked_at IS NULL AND expires_at > now()
        ) g ON TRUE
       WHERE p.id = ${userId}::uuid
    ` as unknown as Promise<MemberRow[]>,
    sql`
      SELECT tier, source, expires_at, original_transaction_id, updated_at
        FROM user_entitlements WHERE user_id = ${userId}::uuid
    ` as unknown as Promise<
      {
        tier: string;
        source: string | null;
        expires_at: string | null;
        original_transaction_id: string | null;
        updated_at: string;
      }[]
    >,
    // Revoked and lapsed grants are included: "we already comped them twice"
    // is the context that stops a third comp.
    sql`
      SELECT id, expires_at, reason, granted_by, granted_at, revoked_at, revoke_reason
        FROM user_entitlement_grants
       WHERE user_id = ${userId}::uuid
       ORDER BY granted_at DESC
       LIMIT 50
    ` as unknown as Promise<
      {
        id: string;
        expires_at: string;
        reason: string;
        granted_by: string;
        granted_at: string;
        revoked_at: string | null;
        revoke_reason: string | null;
      }[]
    >,
    sql`
      SELECT id, from_tier, to_tier, from_expires_at, to_expires_at,
             channel, reason, actor, created_at
        FROM user_entitlement_events
       WHERE user_id = ${userId}::uuid
       ORDER BY created_at DESC
       LIMIT 50
    ` as unknown as Promise<
      {
        id: string;
        from_tier: string | null;
        to_tier: string;
        from_expires_at: string | null;
        to_expires_at: string | null;
        channel: string;
        reason: string | null;
        actor: string;
        created_at: string;
      }[]
    >,
    getAtlasUsage(userId),
  ]);

  const row = rows[0];
  if (!row) return null;
  const sub = subs[0];

  return {
    summary: toSummary(row),
    effective: resolveEntitlement(row),
    subscription: sub
      ? {
          tier: sub.tier,
          source: sub.source,
          expiresAt: sub.expires_at,
          originalTransactionId: sub.original_transaction_id,
          updatedAt: sub.updated_at,
        }
      : null,
    grants: grants.map((g) => ({
      id: String(g.id),
      expiresAt: g.expires_at,
      reason: g.reason,
      grantedBy: g.granted_by,
      grantedAt: g.granted_at,
      revokedAt: g.revoked_at,
      revokeReason: g.revoke_reason,
    })),
    ledger: ledger.map((e) => ({
      id: String(e.id),
      fromTier: e.from_tier,
      toTier: e.to_tier,
      fromExpiresAt: e.from_expires_at,
      toExpiresAt: e.to_expires_at,
      channel: e.channel,
      reason: e.reason,
      actor: e.actor,
      createdAt: e.created_at,
    })),
    usage,
  };
}
