// Pure-data apply: writes hand-authored ja/en gloss layers onto existing
// custom atlas items. No AI calls — content authored offline. Keyed by item
// id, so applying against a DB that lacks those ids is a safe no-op (prod's
// real user items self-heal via the v3 lazy re-enrich instead).
//
// Usage:
//   tsx --env-file=.env.local scripts/apply-atlas-glosses.ts \
//       --src=data/atlas-glosses.json [--dry-run]
//
// Source shape (keyed by item id):
//   {
//     "<uuid>": {
//       "display_ja": "…", "display_en": "…",
//       "definition_ja": "…?",         // cross-language def for EN items
//       "definition_en_cross": "…?",   // cross-language def for JA items
//       "mnemonic_ja": "…?", "mnemonic_en": "…?",
//       "etymology_ja": "…?", "etymology_en": "…?"
//     }
//   }
//
// definition_{ja,en} for the item's own target language is left null — the
// read path (pickAtlasDefinition) falls back to definition_target there.
import { readFileSync } from "node:fs";
import { getSql } from "../lib/db";

const ENRICH_VERSION = 3;

interface Gloss {
  display_ja?: string;
  display_en?: string;
  definition_ja?: string;
  definition_en_cross?: string;
  mnemonic_ja?: string;
  mnemonic_en?: string;
  etymology_ja?: string;
  etymology_en?: string;
}

function clean(s: string | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

async function main() {
  const srcArg = process.argv.find((a) => a.startsWith("--src="));
  const dryRun = process.argv.includes("--dry-run");
  if (!srcArg) {
    console.error("[atlas-gloss] --src=<path> required");
    process.exit(1);
  }
  const src = JSON.parse(readFileSync(srcArg.split("=")[1], "utf-8")) as Record<string, Gloss>;

  const sql = getSql();
  if (!sql) {
    console.error("[atlas-gloss] DATABASE_URL not set");
    process.exit(1);
  }

  let applied = 0;
  let missing = 0;
  for (const [id, g] of Object.entries(src)) {
    const rows = (await sql`
      SELECT target_language, enrichment FROM user_atlas_items
      WHERE id = ${id}::uuid AND deleted_at IS NULL
    `) as unknown as { target_language: "en" | "ja"; enrichment: Record<string, unknown> }[];
    if (!rows.length) {
      missing++;
      continue;
    }
    const isJa = rows[0].target_language === "ja";
    // definition_{lang} holds the cross-language definition; the item's own
    // target language falls back to definition_target at read time.
    const definitionJa = isJa ? null : clean(g.definition_ja);
    const definitionEn = isJa ? clean(g.definition_en_cross) : null;
    const enrichment = {
      ...(rows[0].enrichment ?? {}),
      glossI18n: {
        ja: { mnemonic: clean(g.mnemonic_ja), etymology: clean(g.etymology_ja) },
        en: { mnemonic: clean(g.mnemonic_en), etymology: clean(g.etymology_en) },
      },
      enrichVersion: ENRICH_VERSION,
    };

    if (dryRun) {
      console.log(`  · would apply ${id.slice(0, 8)} [${rows[0].target_language}] ja=${g.display_ja} en=${g.display_en}`);
      applied++;
      continue;
    }
    await sql`
      UPDATE user_atlas_items SET
        display_ja    = ${clean(g.display_ja)},
        display_en    = ${clean(g.display_en)},
        definition_ja = ${definitionJa},
        definition_en = ${definitionEn},
        enrichment    = ${sql.json(enrichment as never)},
        updated_at    = now()
      WHERE id = ${id}::uuid AND deleted_at IS NULL
    `;
    applied++;
    console.log(`  ✓ ${id.slice(0, 8)} [${rows[0].target_language}] ${g.display_ja} / ${g.display_en}`);
  }

  console.log(
    `[atlas-gloss] ${dryRun ? "DRY RUN — " : ""}${applied} item(s)${dryRun ? " would be" : ""} updated, ${missing} not found in this DB`,
  );
  await sql.end();
}

main();
