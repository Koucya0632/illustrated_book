import postgres from "postgres";
import { applyMainWordCorrections } from "../lib/main-word-corrections";
import { applyMainWordExamplePairs } from "../lib/main-word-example-pair-apply";

function categoryArg(argv: string[]): string | undefined {
  const inline = argv.find((arg) => arg.startsWith("--category="));
  if (inline) return inline.slice("--category=".length).trim() || undefined;
  const index = argv.indexOf("--category");
  if (index === -1) return undefined;
  return argv[index + 1]?.trim() || undefined;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  try {
    const category = categoryArg(process.argv.slice(2));
    const scopedRows = category
      ? await sql<{ id: string }[]>`
          SELECT id FROM words
          WHERE category = ${category}
            AND status = 'published'
            AND deleted_at IS NULL
          ORDER BY id
        `
      : null;
    const wordIds = scopedRows ? new Set(scopedRows.map(({ id }) => id)) : undefined;
    if (category && wordIds?.size === 0) {
      throw new Error(`No published words found for category: ${category}`);
    }
    if (category) {
      console.log(`[main-word-corrections] scoped to ${category} (${wordIds?.size ?? 0} words)`);
    }
    const count = await applyMainWordCorrections(sql, wordIds);
    console.log(`[main-word-corrections] checked ${count} main-word rows`);
    const examples = await applyMainWordExamplePairs(sql, wordIds);
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
