import postgres from "postgres";
import { applyMainWordMerges } from "../lib/main-word-merges";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  try {
    const count = await applyMainWordMerges(sql);
    console.log(`[main-word-merges] merged ${count} duplicate main-word row(s)`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[main-word-merges] failed:", error);
  process.exit(1);
});
