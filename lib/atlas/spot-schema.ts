// Schema for 自製圖鑑 cards tagged to a 景點 (lib/travel/spot-tagging.ts).
//
// Its own list, spread into scripts/migrate.ts, so the Postgres tests run the
// very statements production does. Every ALTER on a hot table is guarded
// (lib/ddl.ts): an unconditional one deadlocked a production migrate.

import { onlyIf } from "../ddl";

const column = (table: string, name: string, definition: string) =>
  onlyIf(
    `NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = '${table}'::regclass
      AND attname = '${name}' AND NOT attisdropped)`,
    `ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`,
  );

export const ATLAS_REPORT_REASONS = ["spam", "inappropriate", "copyright", "wrong", "other", "not_here"] as const;
export const ATLAS_REPORT_TARGETS = ["item", "collection", "author", "item_spot"] as const;

const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(",");

/** Swap a CHECK for one that allows `values`, unless its definition already names the newest. */
const check = (table: string, name: string, legacyName: string, columnName: string, values: readonly string[]) =>
  onlyIf(
    `NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '${table}'::regclass
      AND conname = '${name}' AND pg_get_constraintdef(oid) LIKE '%''${values[values.length - 1]}''%')`,
    `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${legacyName}`,
    `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`,
    `ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${columnName} IN (${list(values)}))`,
  );

export const ATLAS_SPOT_DDL: readonly string[] = [
  // Only the spot id, never coordinates (parent repo docs/adr/0002).
  column("user_atlas_items", "spot_id", "TEXT"),
  column("user_atlas_items", "spot_shared", "BOOLEAN NOT NULL DEFAULT false"),
  column("user_atlas_items", "spot_share_revoked", "TEXT"),
  // Copied onto the public row only while shared, so 「大家拍的」 reads one table.
  column("atlas_public_items", "spot_id", "TEXT"),
  `CREATE INDEX IF NOT EXISTS atlas_public_items_spot_idx
     ON atlas_public_items(spot_id, published_at DESC)
     WHERE review_status = 'approved' AND spot_id IS NOT NULL`,
  // 「不是在這裡拍的」 is filed against the card AT a spot, a target of its own,
  // so it neither collides with the reporter's other report on the same card
  // nor counts toward taking the card off 物見.
  check("atlas_reports", "atlas_reports_reason_chk", "atlas_reports_reason_check", "reason", ATLAS_REPORT_REASONS),
  check("atlas_reports", "atlas_reports_target_type_chk", "atlas_reports_target_type_check", "target_type", ATLAS_REPORT_TARGETS),
];
