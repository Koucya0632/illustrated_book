// The two numbers 補充 (enrichment) is bounded by. No AI SDK import, so the
// fulfillment service and a test can read them without dragging a model in.
//
// See docs/adr/0011 and 0016 in tuji-ios.

// The recipe that produced an item's stored fields; stamped into
// `enrichment.enrichVersion` and `backfill_attempts_version`. It records, it
// does not trigger: 補充 runs once per confirmed card, as the included
// fulfillment of the credit operation that made it, and nothing re-runs it when
// this number moves. A recipe change that should reach existing cards needs its
// own backfill job (and a decision about who pays for it).
//
// v2: JA reading generated on ATLAS_ENRICH_MODEL. v3: every item also gets
// display_ja/display_en, definition_ja/definition_en and enrichment.glossI18n.
export const ATLAS_ENRICH_VERSION = 3;

/// How many paid 補充 passes one card may spend before it is given up on
/// (`skipped`) and the included service is compensated. 0 is a legitimate
/// value: it turns 補充 off without a deploy.
export function atlasEnrichMaxAttempts(): number {
  const raw = process.env.ATLAS_ENRICH_MAX_ATTEMPTS;
  const n = raw === undefined || raw === "" ? 3 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}
