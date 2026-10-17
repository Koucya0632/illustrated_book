/**
 * Every deploy runs the schema DDL, and with live requests reading these tables
 * an unconditional ALTER deadlocked a production migrate (2026-10-16) — so only
 * alter what needs it.
 */
export function onlyIf(condition: string, ...statements: string[]): string {
  return `DO $$ BEGIN IF ${condition} THEN ${statements.map(s => s + ";").join(" ")} END IF; END $$`;
}
