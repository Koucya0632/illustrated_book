// SELECT-only planner for the mixed Australia atlas batch. There is no apply mode.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { prepareAustralianPlan, preflightAustralianDatabase } from "../lib/catalogue/publish/australia-plan";

const argv = process.argv.slice(2);
const allowed = new Set(["--source", "--reserved-ids", "--output", "--check-db", "--listening-waived-by-user"]);
for (const [i, arg] of argv.entries()) {
  if (arg.startsWith("--") && !allowed.has(arg)) throw new Error(`unsupported argument ${arg}; this command cannot apply or upload`);
  if (!arg.startsWith("--") && (i === 0 || !["--source", "--reserved-ids", "--output"].includes(argv[i - 1]))) throw new Error("unexpected argument");
}
function value(flag: string) {
  const i = argv.indexOf(flag), v = argv[i + 1];
  if (i < 0 || !v || v.startsWith("--")) throw new Error(`${flag} requires a value`);
  return path.resolve(v);
}
async function main() {
  const source = value("--source"), reserved = value("--reserved-ids"), output = value("--output");
  const plan = prepareAustralianPlan(source, reserved, process.cwd(), { listeningWaivedByUser: argv.includes("--listening-waived-by-user") });
  let databasePreflight = null;
  if (argv.includes("--check-db")) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) throw new Error("--check-db requires DATABASE_URL");
    const sql = postgres(databaseUrl, { ssl: "require", prepare: false, max: 1 });
    try {
      databasePreflight = await preflightAustralianDatabase(sql, plan);
    } finally { await sql.end(); }
  }
  // Create-only plan files; never silently replace a reviewed prior artifact.
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify({ ...plan, databasePreflight }, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output, planDigest: plan.planDigest, summary: plan.summary, gates: plan.gates, databasePreflight: databasePreflight ? "completed; guarded apply remains blocked" : "not checked" }, null, 2));
}
main().catch((error) => { console.error("[australian-plan]", error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
