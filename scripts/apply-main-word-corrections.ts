import postgres from "postgres";
import { applyMainWordCorrections } from "../lib/main-word-corrections";
import { applyMainWordExamplePairs } from "../lib/main-word-example-pair-apply";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  try {
    const count = await applyMainWordCorrections(sql);
    console.log(`[main-word-corrections] checked ${count} main-word rows`);
    const examples = await applyMainWordExamplePairs(sql);
    console.log(
      `[main-word-examples] checked ${examples.checked}, updated ${examples.updated}, unchanged ${examples.unchanged}, span sentences updated ${examples.spanSentencesUpdated}`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[main-word-corrections] failed:", error);
  process.exit(1);
});
