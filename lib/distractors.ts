// Distractor selection for MCQ cards. Replaces the old "ORDER BY random()"
// pool with a metadata-aware scorer so wrong answers feel plausible instead
// of obviously wrong:
//
//   - Curated relations (`confusing` > `synonym` > `see-also`) are the
//     strongest signal — those edges literally say "people mix these up".
//   - Same category (e.g. 廚房 with 廚房) matters next: the user is in a
//     thematic study session, so cross-theme distractors stick out.
//   - Same part-of-speech and same CEFR level are small structural boosts.
//     (Today most of the corpus is nouns with null cefr, so these are
//     near-no-ops — present for forward compatibility as verbs/adjectives
//     and CEFR labelling fill in.)
//   - Spelling similarity (Levenshtein on the lemma) catches near-misses
//     like soap/soup, fridge/freezer, deodorant/disinfectant.
//   - Pronunciation similarity (Levenshtein on the IPA, stress stripped)
//     catches homophones / near-homophones that spelling misses.
//
// Each candidate gets a numeric score; ties are broken with a small random
// epsilon so the same study session doesn't show identical distractors on
// every visit.

import "server-only";

export interface CandidateMeta {
  cardId: number;
  back: string;        // the distractor text to show
  wordId: string;
  word: string;        // English lemma (for spelling similarity)
  pos: string;
  category: string;
  cefr: string | null;
  pronunciation: string;
}

export interface TargetMeta extends CandidateMeta {
  deckKey: string;
}

export interface RelationEdge {
  source: string;
  target: string;
  type: string;
}

const W = {
  confusing: 12,
  synonym: 6,
  seeAlso: 3,
  sameCategory: 5,
  samePos: 4,
  sameCefr: 2,
  spelling: 6,    // max contribution
  pronunciation: 4,
  tieBreakEps: 1.0,
} as const;

// IPA glyphs that don't carry phonemic identity for our similarity check.
// Slashes/brackets bound a transcription, dot separates syllables, the
// stress marks are suprasegmental.
const IPA_NOISE = /[\/\[\].·ˈˌ]/g;

function stripIPA(s: string): string {
  return s.replace(IPA_NOISE, "").trim();
}

// Standard Levenshtein with rolling rows (O(n*m) time, O(n) memory).
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function normalizedSimilarity(a: string, b: string): number {
  if (!a && !b) return 0;
  const maxLen = Math.max(a.length, b.length, 1);
  return Math.max(0, 1 - levenshtein(a, b) / maxLen);
}

function scoreCandidate(
  target: TargetMeta,
  cand: CandidateMeta,
  relations: RelationEdge[],
): number {
  if (cand.cardId === target.cardId) return -Infinity;
  if (cand.back === target.back) return -Infinity;

  let score = 0;

  // Curated relation edges (bidirectional — symmetric for confusing/synonym).
  for (const r of relations) {
    const linked =
      (r.source === target.wordId && r.target === cand.wordId) ||
      (r.target === target.wordId && r.source === cand.wordId);
    if (!linked) continue;
    if (r.type === "confusing") score += W.confusing;
    else if (r.type === "synonym") score += W.synonym;
    else if (r.type === "see-also") score += W.seeAlso;
  }

  if (cand.category && cand.category === target.category) score += W.sameCategory;
  if (cand.pos && cand.pos === target.pos) score += W.samePos;
  if (cand.cefr && target.cefr && cand.cefr === target.cefr) score += W.sameCefr;

  score += W.spelling * normalizedSimilarity(
    cand.word.toLowerCase(),
    target.word.toLowerCase(),
  );
  score += W.pronunciation * normalizedSimilarity(
    stripIPA(cand.pronunciation),
    stripIPA(target.pronunciation),
  );

  return score;
}

export function selectDistractors(
  target: TargetMeta,
  pool: CandidateMeta[],
  relations: RelationEdge[],
  n = 3,
): string[] {
  if (pool.length === 0) return [];
  const scored = pool
    .map((c) => {
      const base = scoreCandidate(target, c, relations);
      // Tie-breaker epsilon keeps equally-good candidates rotating across
      // sessions instead of always picking the same one alphabetically.
      const jitter = Math.random() * W.tieBreakEps;
      return { c, total: base + jitter, base };
    })
    .filter((x) => Number.isFinite(x.base));

  scored.sort((a, b) => b.total - a.total);

  const out: string[] = [];
  const seen = new Set<string>([target.back]);
  for (const { c } of scored) {
    if (out.length >= n) break;
    if (seen.has(c.back)) continue;
    seen.add(c.back);
    out.push(c.back);
  }
  return out;
}

// Exported for tests / debugging — surfaces what each candidate scored on
// what dimension so we can sanity-check distractor quality.
export function explainScore(
  target: TargetMeta,
  cand: CandidateMeta,
  relations: RelationEdge[],
): { total: number; parts: Record<string, number> } {
  const parts: Record<string, number> = {};
  for (const r of relations) {
    const linked =
      (r.source === target.wordId && r.target === cand.wordId) ||
      (r.target === target.wordId && r.source === cand.wordId);
    if (!linked) continue;
    if (r.type === "confusing") parts.confusing = (parts.confusing ?? 0) + W.confusing;
    else if (r.type === "synonym") parts.synonym = (parts.synonym ?? 0) + W.synonym;
    else if (r.type === "see-also") parts.seeAlso = (parts.seeAlso ?? 0) + W.seeAlso;
  }
  if (cand.category && cand.category === target.category) parts.sameCategory = W.sameCategory;
  if (cand.pos && cand.pos === target.pos) parts.samePos = W.samePos;
  if (cand.cefr && target.cefr && cand.cefr === target.cefr) parts.sameCefr = W.sameCefr;
  const sp = normalizedSimilarity(
    cand.word.toLowerCase(),
    target.word.toLowerCase(),
  );
  if (sp > 0) parts.spelling = Math.round(W.spelling * sp * 100) / 100;
  const pr = normalizedSimilarity(
    stripIPA(cand.pronunciation),
    stripIPA(target.pronunciation),
  );
  if (pr > 0) parts.pronunciation = Math.round(W.pronunciation * pr * 100) / 100;
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { total: Math.round(total * 100) / 100, parts };
}
