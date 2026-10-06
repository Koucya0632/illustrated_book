import postgres from "postgres";
import { preflightCredits } from "../lib/credits/preflight";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--environment" || !["sandbox", "production"].includes(args[1])) {
    throw new Error("Usage: npx tsx scripts/preflight-credits.ts --environment sandbox|production");
  }
  // Explicit operator credentials. Do not load an environment file or migrate.
  if (!process.env.DATABASE_URL) throw new Error("Provide DATABASE_URL for the database to inspect.");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10, idle_timeout: 5 });
  try {
    const report = await preflightCredits(sql, args[1] as "sandbox" | "production");
    console.log(JSON.stringify(report, null, 2));
    if (!report.databaseChecksPassed) process.exitCode = 1;
  } catch {
    console.error("Credit preflight failed. Check database access and schema; no data was changed.");
    process.exitCode = 1;
  } finally { await sql.end({ timeout: 5 }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

