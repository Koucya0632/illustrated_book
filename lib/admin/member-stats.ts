import type postgres from "postgres";

export interface MembershipCounts {
  total: number;
  pro: number;
  paid: number;
  lifetime: number;
  free: number;
  lifetimeHoldings: number;
  lifetimePurchased: number;
  lifetimeGranted: number;
}

/** Effective tiers are exclusive; a Pro account can also hold lifetime access. */
export async function loadMembershipCounts(sql: postgres.Sql | postgres.TransactionSql): Promise<MembershipCounts> {
  const [row] = await sql<MembershipCounts[]>`
    WITH pro_users AS (
      SELECT user_id, TRUE AS paid FROM user_entitlements
       WHERE tier = 'pro' AND (expires_at IS NULL OR expires_at > now())
      UNION ALL
      SELECT user_id, FALSE FROM user_entitlement_grants
       WHERE revoked_at IS NULL AND expires_at > now()
    ), accounts AS (
      SELECT p.id,
             EXISTS (SELECT 1 FROM pro_users s WHERE s.user_id = p.id) AS pro,
             EXISTS (SELECT 1 FROM pro_users s WHERE s.user_id = p.id AND s.paid) AS paid,
             l.source AS lifetime_source
        FROM profiles p
        LEFT JOIN user_lifetime_entitlements l ON l.user_id = p.id AND l.revoked_at IS NULL
    )
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE pro)::int AS pro,
           count(*) FILTER (WHERE paid)::int AS paid,
           count(*) FILTER (WHERE NOT pro AND lifetime_source IS NOT NULL)::int AS lifetime,
           count(*) FILTER (WHERE NOT pro AND lifetime_source IS NULL)::int AS free,
           count(*) FILTER (WHERE lifetime_source IS NOT NULL)::int AS "lifetimeHoldings",
           count(*) FILTER (WHERE lifetime_source IN ('appstore', 'play'))::int AS "lifetimePurchased",
           count(*) FILTER (WHERE lifetime_source IN ('grant', 'legacy_pro'))::int AS "lifetimeGranted"
      FROM accounts
  `;
  return row;
}
