// Read-only report of what the next deploy will warn about or hold back:
//
//   - published words with no registered example pair (the deploy skips their
//     examples and warns; register the release in lib/catalogue/releases.ts)
//   - guarded topics and how many planned words each is still waiting for
//
//   DATABASE_URL=... npm run catalogue:check
//
// Runs in a READ ONLY transaction. Exits 1 when a published word is
// unregistered, so it can gate a release checklist.

import postgres from "postgres";
import { readCatalogueGaps } from "../lib/catalogue/sync";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[catalogue:check] DATABASE_URL is not set.");
    process.exitCode = 2;
    return;
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  const sql = postgres(url, { ssl: local ? false : "require", prepare: false, max: 1 });
  try {
    const gaps = await sql.begin("read only", (tx) => readCatalogueGaps(tx));
    for (const topic of gaps.guardedTopics) {
      console.log(
        topic.open
          ? `[catalogue:check] ${topic.category}: open`
          : `[catalogue:check] ${topic.category}: held, ${topic.missing.length} planned word(s) not published in it`,
      );
    }
    if (gaps.unregistered.length === 0) {
      console.log("[catalogue:check] every published word has a registered example pair.");
      return;
    }
    console.log(
      `[catalogue:check] ${gaps.unregistered.length} published word(s) have no registered example pair:`,
    );
    for (const id of gaps.unregistered) console.log(`  ${id}`);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[catalogue:check] failed:", error);
  process.exitCode = 1;
});
