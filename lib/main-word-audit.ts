import { isKanaOnly, type FuriganaSegment } from "./kana";
import { MAIN_WORD_CORRECTIONS } from "./main-word-corrections";
import { MAIN_WORD_MERGES } from "./main-word-merges";

const JAPANESE_RENAMES = new Map(
  MAIN_WORD_CORRECTIONS.filter(
    (correction) =>
      correction.oldJa && correction.ja && correction.oldJa !== correction.ja,
  ).map((correction) => [correction.id, { old: correction.oldJa!, value: correction.ja! }]),
);
const JAPANESE_EXAMPLE_CORRECTIONS = new Map(
  MAIN_WORD_CORRECTIONS.flatMap((correction) => {
    const first = correction.examples?.find((example) => example.sortOrder === 0);
    return first?.oldJa && first.ja
      ? [[correction.id, { old: first.oldJa, value: first.ja }] as const]
      : [];
  }),
);

export type MainWordAuditRow = {
  id: string;
  jaTerm: string | null;
  jaReading: string | null;
  readingSegments: FuriganaSegment[] | string | null;
  jaDefinition: string | null;
  zhDefinition: string | null;
  exampleId: number | null;
  jaExample: string | null;
  zhExample: string | null;
};

export type MainWordAuditIssue = {
  id: string;
  field: string;
  message: string;
};

function issue(id: string, field: string, message: string): MainWordAuditIssue {
  return { id, field, message };
}

export function auditMainWordRows(rows: readonly MainWordAuditRow[]): MainWordAuditIssue[] {
  const issues: MainWordAuditIssue[] = [];
  const publishedIds = new Set(rows.map((row) => row.id));

  for (const merge of MAIN_WORD_MERGES) {
    if (publishedIds.has(merge.sourceId) && publishedIds.has(merge.targetId)) {
      issues.push(
        issue(
          merge.sourceId,
          "duplicateMainWord",
          `duplicates canonical main word ${merge.targetId}: ${merge.reason}`,
        ),
      );
    }
  }

  for (const row of rows) {
    if (!row.jaTerm) issues.push(issue(row.id, "jaTerm", "missing Japanese headword"));
    if (!row.zhDefinition) issues.push(issue(row.id, "zhDefinition", "missing Chinese gloss"));
    if (!row.jaDefinition) {
      issues.push(issue(row.id, "jaDefinition", "missing Japanese definition"));
    }
    if (row.exampleId == null) issues.push(issue(row.id, "example", "missing example"));
    if (!row.jaExample) issues.push(issue(row.id, "jaExample", "missing Japanese example"));
    if (!row.zhExample) issues.push(issue(row.id, "zhExample", "missing Chinese example"));

    if (!row.jaTerm) continue;

    if (isKanaOnly(row.jaTerm) && row.jaReading && row.jaReading !== row.jaTerm) {
      issues.push(
        issue(
          row.id,
          "jaReading",
          `kana headword ${row.jaTerm} cannot have unrelated reading ${row.jaReading}`,
        ),
      );
    }

    const readingSegments = Array.isArray(row.readingSegments) ? row.readingSegments : null;
    if (typeof row.readingSegments === "string") {
      issues.push(
        issue(row.id, "readingSegments", "reading segments must be a JSON array, not a string"),
      );
    }
    if (readingSegments && readingSegments.length > 0) {
      const segmentTerm = readingSegments.map((segment) => segment.text).join("");
      if (segmentTerm !== row.jaTerm) {
        issues.push(
          issue(
            row.id,
            "readingSegments",
            `segments rebuild ${segmentTerm}, not ${row.jaTerm}`,
          ),
        );
      }

      if (row.jaReading) {
        const segmentReading = readingSegments
          .map((segment) => segment.ruby ?? segment.text)
          .join("");
        if (segmentReading !== row.jaReading) {
          issues.push(
            issue(
              row.id,
              "readingSegments",
              `segments read ${segmentReading}, not ${row.jaReading}`,
            ),
          );
        }
      }
    }

    const definitionHeadword = row.jaDefinition?.match(/^「([^」]+)」/)?.[1];
    if (definitionHeadword && definitionHeadword !== row.jaTerm) {
      issues.push(
        issue(
          row.id,
          "jaDefinition",
          `definition introduces ${definitionHeadword}, not ${row.jaTerm}`,
        ),
      );
    }

    const rename = JAPANESE_RENAMES.get(row.id);
    if (
      rename &&
      row.jaExample?.includes(rename.old) &&
      !row.jaExample.includes(rename.value)
    ) {
      issues.push(
        issue(
          row.id,
          "jaExample",
          `example still uses renamed headword ${rename.old}, not ${rename.value}`,
        ),
      );
    }

    const exampleCorrection = JAPANESE_EXAMPLE_CORRECTIONS.get(row.id);
    if (
      exampleCorrection &&
      row.jaExample === exampleCorrection.old &&
      row.jaExample !== exampleCorrection.value
    ) {
      issues.push(
        issue(
          row.id,
          "jaExample",
          `example still uses the known old sentence instead of the corrected Japanese sentence`,
        ),
      );
    }
  }

  return issues;
}
