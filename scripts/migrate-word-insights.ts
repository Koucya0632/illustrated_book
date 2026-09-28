// Isolated schema rollout; avoids running unrelated full-project migrations.
// Dry run by default. The full scripts/migrate.ts also includes this DDL.
import { getSql } from "../lib/db";
import { WORD_INSIGHTS_DDL } from "../lib/word-insights-schema";

async function main(): Promise<void> {
  if (!process.argv.includes("--apply")) {
    console.log("[word-insights] dry run: create English and Japanese insight tables and enable RLS; pass --apply to run");
    return;
  }
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is required");
  try {
    await sql.begin(async (tx) => {
      for (const statement of WORD_INSIGHTS_DDL) await tx.unsafe(statement);
    });
    console.log("[word-insights] schema ready; RLS enabled without public policies");
  } finally {
    await sql.end();
  }
}

main().catch((error) => { console.error("[word-insights] migration failed", error); process.exitCode = 1; });
