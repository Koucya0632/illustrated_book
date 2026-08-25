// When 補充 (enrichment) may spend money, and which recipe is current.
//
// Split out of enrich.ts, which imports "server-only" and the whole AI SDK: the
// spend decision is a pure rule that route handlers, the DB writers and the
// tests all have to ask, and none of them should have to drag a model client in
// to ask it. Named for what it decides rather than for whoever calls it.
//
// See docs/adr/0011 in tuji-ios.

import type { AtlasItemRow } from "@/lib/atlas/types";

// Bump when enrichAtlasItem's output changes in a way existing rows should
// re-pick-up on next open. v2: JA reading is generated on ATLAS_ENRICH_MODEL
// (OpenAI-direct) instead of generateJapaneseReading, which routed through the
// unusable Vercel AI Gateway and left reading null. v3: gloss language follows
// the UI language — every item now also gets display_ja/display_en,
// definition_ja/definition_en and enrichment.glossI18n so ja/en interfaces
// read glosses they can understand. Rows below this version are re-enriched
// once (see needsEnrichRefresh). A pass that returns stamps this version even
// where individual generation steps came back null — but a pass that THROWS
// stamps nothing, so an item that keeps breaking reads as stale forever. That
// is why the spend ceiling is the attempt budget and not staleness.
export const ATLAS_ENRICH_VERSION = 3;

/// True for items enriched under an older scheme (v3 added the ja/en gloss
/// layer), so callers re-enrich them once and skip embedding their stale
/// detail. Only says the recipe moved on — it is NOT the spend decision, which
/// is shouldEnrichAtlasItem. A failed pass never stamps the version, so an item
/// that keeps breaking stays "stale" forever; letting that short-circuit the
/// budget would defeat it entirely.
export function needsEnrichRefresh(item: AtlasItemRow): boolean {
  return (item.enrichment?.enrichVersion ?? 0) < ATLAS_ENRICH_VERSION;
}

/// How many 補充 passes one item may spend under a single ATLAS_ENRICH_VERSION.
/// 0 is a legitimate value: it turns enrichment off without a deploy.
export function atlasEnrichMaxAttempts(): number {
  const raw = process.env.ATLAS_ENRICH_MAX_ATTEMPTS;
  const n = raw === undefined || raw === "" ? 3 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

/// Attempts already spent on the CURRENT recipe. A budget belongs to a recipe,
/// so a version bump reads as a fresh 0 — that, and nothing else, is what
/// revives a `skipped` item.
function attemptsUnderCurrentVersion(item: AtlasItemRow): number {
  if ((item.backfill_attempts_version ?? 0) !== ATLAS_ENRICH_VERSION) return 0;
  return item.backfill_attempts ?? 0;
}

/// **Whether this item should cost money.** One question, one answer: every
/// paying caller asks here and nowhere else.
///
/// This used to be spelled out at each call site, and one of the spellings —
/// `backfill_status !== 'filled'` — was true forever once an item failed, so a
/// reliably-failing item re-ran the whole paid pass (3-4 model calls) on every
/// 詳情 open, with no ceiling. See docs/adr/0011 in tuji-ios.
///
/// `skipped` needs no branch of its own: an item is skipped exactly when its
/// budget ran out under the version it was skipped at, so the count already
/// says so. Two sources of truth for one fact is the defect this fixes.
export function shouldEnrichAtlasItem(item: AtlasItemRow): boolean {
  if (item.backfill_status === "filled" && !needsEnrichRefresh(item)) return false;
  return attemptsUnderCurrentVersion(item) < atlasEnrichMaxAttempts();
}

/// What a failure writer should record: the new count, and the status it puts
/// the item in. Exported so the budget arithmetic lives beside the rule that
/// reads it rather than inside a SQL string.
export function nextBackfillAttempt(item: AtlasItemRow): {
  attempts: number;
  version: number;
  status: "failed" | "skipped";
} {
  const attempts = attemptsUnderCurrentVersion(item) + 1;
  return {
    attempts,
    version: ATLAS_ENRICH_VERSION,
    status: attempts >= atlasEnrichMaxAttempts() ? "skipped" : "failed",
  };
}
