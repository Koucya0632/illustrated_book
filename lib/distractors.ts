// Rank plausible distractors, then sample from bounded pools. Synonyms are
// exclusions, never a difficulty bonus. Pure: also used by the release audit.
import { assembleStudyChoices, choicesConflict, prepareChoiceCandidates, type ChoiceWord, type StudyChoiceCandidate } from "./study-choices";

export interface CandidateMeta {
  cardId: number | string;
  back: string;        // the distractor text to show
  wordId: string;
  word: string;        // English lemma (for spelling similarity)
  pos: string;
  category: string;
  cefr: string | null;
  pronunciation: string;
  language?: "en" | "ja";
  gloss?: string;
  exclusions?: string[];
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
  seeAlso: 3,
  sameCategory: 5,
  samePos: 4,
  sameCefr: 2,
  spelling: 6,    // max contribution
  pronunciation: 4,
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
    else if (r.type === "synonym") return -Infinity;
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

export function candidateWord(c: CandidateMeta): ChoiceWord {
  return { wordId: c.wordId, label: c.back, language: c.language ?? "en", gloss: c.gloss ?? "", category: c.category, pos: c.pos, exclusions: c.exclusions ?? [] };
}

/** Include both directions and distractor-to-distractor edges. */
export function attachChoiceExclusions(pool: CandidateMeta[], relations: RelationEdge[]): CandidateMeta[] {
  const byId = new Map(pool.map(c => [c.wordId, c]));
  const blocked = new Map<string, Set<string>>();
  for (const r of relations) {
    if (r.type !== "synonym") continue;
    const a = byId.get(r.source), b = byId.get(r.target);
    if (!a || !b) continue;
    for (const [source, label] of [[a.wordId, b.back], [b.wordId, a.back]]) {
      const set = blocked.get(source) ?? new Set<string>();
      set.add(label); blocked.set(source, set);
    }
  }
  return pool.map(c => ({ ...c, exclusions: [...(c.exclusions ?? []), ...(blocked.get(c.wordId) ?? [])] }));
}

export function buildChoiceCandidates(target: TargetMeta, pool: CandidateMeta[], relations: RelationEdge[]): StudyChoiceCandidate[] {
  const answer = candidateWord(target);
  const candidates = pool.flatMap(c => {
    const word = candidateWord(c);
    if (word.language !== answer.language || choicesConflict(answer, word)) return [];
    const score = scoreCandidate(target, c, relations);
    if (!Number.isFinite(score)) return [];
    const sameCategory = !!target.category && target.category === c.category;
    const close = normalizedSimilarity(target.back.toLowerCase(), c.back.toLowerCase()) >= 0.45 ||
      (!!target.pronunciation && !!c.pronunciation && normalizedSimilarity(stripIPA(target.pronunciation), stripIPA(c.pronunciation)) >= 0.55) ||
      relations.some(r => r.type === "confusing" && ((r.source === target.wordId && r.target === c.wordId) || (r.target === target.wordId && r.source === c.wordId)));
    return [{ ...word, tier: sameCategory ? (close ? 1 : 2) : 3,
      weight: 1 + score + (!sameCategory && !!target.pos && target.pos === c.pos ? 32 : 0) }];
  });
  return prepareChoiceCandidates(answer, candidates);
}

export function selectDistractors(target: TargetMeta, pool: CandidateMeta[], relations: RelationEdge[], n = 3): string[] {
  const enriched = attachChoiceExclusions(pool, relations);
  const self = enriched.find(c => c.wordId === target.wordId);
  const effective = { ...target, exclusions: self?.exclusions ?? target.exclusions };
  return assembleStudyChoices(candidateWord(effective), buildChoiceCandidates(effective, enriched, relations), Math.floor(Math.random() * 4294967296))
    .filter(label => label !== target.back).slice(0, n);
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
    else if (r.type === "synonym") return { total: -Infinity, parts: { synonymExcluded: 1 } };
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
