// Cutover step (docs/MEMBERSHIP_ENGINEERING_CHECKLIST.md §8): every account
// whose Pro is LIVE at the switch gets a 永久權益 for free, source 'legacy_pro'.
//
//   npx tsx --env-file=.env.local scripts/grant-legacy-pro-lifetime.ts            # dry run
//   npx tsx --env-file=.env.local scripts/grant-legacy-pro-lifetime.ts --apply    # write
//
// Run it right before flipping MEMBERSHIP_POLICY to v2. Safe to re-run: an
// account that already holds a lifetime (any source) is skipped, and nothing is
// ever deleted. "Live Pro" is the same union every gate uses (subscription ∪
// un-revoked grant), so a comped account counts — exclude test accounts by
// revoking their grants first if they should not be carried over.
//
// NOTE: DATABASE_URL is the PRODUCTION database.

import { getSql } from "../lib/db";
import { grantLifetimeHolding } from "../lib/atlas/lifetime";

async function main() {
  const apply = process.argv.includes("--apply");
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is required");

  try {
    const rows = (await sql`
      SELECT p.id, p.username,
             (e.tier = 'pro' AND (e.expires_at IS NULL OR e.expires_at > now())) AS sub_live,
             g.expires_at AS grant_expires_at,
             EXISTS (SELECT 1 FROM user_lifetime_entitlements l
                      WHERE l.user_id = p.id AND l.revoked_at IS NULL) AS has_lifetime
        FROM profiles p
        LEFT JOIN user_entitlements e ON e.user_id = p.id
        LEFT JOIN LATERAL (
          SELECT max(expires_at) AS expires_at
            FROM user_entitlement_grants
           WHERE user_id = p.id AND revoked_at IS NULL AND expires_at > now()
        ) g ON TRUE
       WHERE (e.tier = 'pro' AND (e.expires_at IS NULL OR e.expires_at > now()))
          OR g.expires_at IS NOT NULL
       ORDER BY p.username
    `) as {
      id: string;
      username: string;
      sub_live: boolean | null;
      grant_expires_at: string | null;
      has_lifetime: boolean;
    }[];

    const day = new Date().toISOString().slice(0, 10);
    let granted = 0;
    let skipped = 0;
    for (const r of rows) {
      const via = [r.sub_live ? "subscription" : null, r.grant_expires_at ? "grant" : null]
        .filter(Boolean)
        .join("+");
      if (r.has_lifetime) {
        skipped++;
        console.log(`skip   ${r.username} (${via}) — already holds a lifetime`);
        continue;
      }
      if (!apply) {
        console.log(`would  ${r.username} (${via})`);
        continue;
      }
      const { status } = await grantLifetimeHolding({
        userId: r.id,
        source: "legacy_pro",
        reason: `切換日補發：${day} 時為有效 Pro（${via}）`,
        grantedBy: "migration",
      });
      if (status === "granted") granted++;
      else skipped++;
      console.log(`${status === "granted" ? "grant " : "skip  "} ${r.username} (${via})`);
    }
    console.log(
      apply
        ? `done: ${granted} granted, ${skipped} skipped, ${rows.length} live Pro accounts.`
        : `dry run: ${rows.length} live Pro accounts, ${skipped} already hold a lifetime. Re-run with --apply to write.`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
