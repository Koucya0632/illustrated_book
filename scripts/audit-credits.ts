import postgres from "postgres";
import { auditCredits } from "../lib/credits/audit";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--environment" || !["sandbox", "production"].includes(args[1])) {
    throw new Error("Usage: npx tsx scripts/audit-credits.ts --environment sandbox|production");
  }
  // Credentials are supplied by the operator; no implicit .env loading or migration.
  if (!process.env.DATABASE_URL) throw new Error("Provide DATABASE_URL for the database to audit.");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10, idle_timeout: 5 });
  try {
    const audit = await auditCredits(sql, args[1] as "sandbox" | "production");
    console.log(JSON.stringify(audit, null, 2));
    if (audit.mismatches.length || audit.truncated) process.exitCode = 1;
  } catch {
    console.error("Credit audit failed. Check database access and schema; no balances were changed.");
    process.exitCode = 1;
  } finally { await sql.end({ timeout: 5 }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

