import postgres from "postgres";
import { applyMainWordCorrections } from "../lib/main-word-corrections";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  try {
    const count = await applyMainWordCorrections(sql);
    console.log(`[main-word-corrections] checked ${count} main-word rows`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[main-word-corrections] failed:", error);
  process.exit(1);
});
