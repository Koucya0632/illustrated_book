// Additive schemas shared by the full migration and the targeted rollout.
// Separate tables keep the published English rows untouched during Japanese rollout.
function schemaFor(table: "word_insights" | "word_insights_ja"): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS ${table} (
       word_id      TEXT PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
       confusables  JSONB NOT NULL DEFAULT '[]'::jsonb,
       mistakes     JSONB NOT NULL DEFAULT '[]'::jsonb,
       usage        JSONB,
       updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
       CHECK (jsonb_typeof(confusables) = 'array'),
       CHECK (jsonb_typeof(mistakes) = 'array'),
       CHECK (usage IS NULL OR jsonb_typeof(usage) = 'object')
     )`,
    `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
  ];
}

export const WORD_INSIGHTS_DDL = [
  ...schemaFor("word_insights"),
  ...schemaFor("word_insights_ja"),
] as const;
