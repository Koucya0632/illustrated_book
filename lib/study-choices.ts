// Shared by the server and browser. Native ports use the same data and contract
// fixtures (scripts/sync-study-choice-data.mjs).
import data from "./study-choice-data.json";

export type ChoiceLanguage = "en" | "ja";
export interface ChoiceWord {
  wordId: string;
  label: string;
  language: ChoiceLanguage;
  gloss: string;
  category?: string;
  pos?: string;
  /** Labels that cannot be offered beside this word, including authored synonyms. */
  exclusions?: string[];
}
export interface StudyChoiceCandidate extends ChoiceWord {
  tier: number;
  weight: number;
}

export function choiceKey(label: string): string {
  // Pd includes hyphens, but NOT the Japanese prolonged sound mark (ー).
  return label.normalize("NFKC").toLowerCase().replace(/[\s\p{Pd}]/gu, "");
}

function glosses(gloss: string): Set<string> {
  return new Set(gloss.normalize("NFKC").toLowerCase().split(/[/、,，;；]/u).map(s => s.trim()).filter(Boolean));
}
function tokens(label: string): Set<string> {
  return new Set(label.normalize("NFKC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
}
const aliases = data.aliases.map(group => new Set(group.map(choiceKey)));

/** Symmetric: also checked between the three distractors, not just the answer. */
export function choicesConflict(a: ChoiceWord, b: ChoiceWord): boolean {
  const ak = choiceKey(a.label), bk = choiceKey(b.label);
  if (!ak || !bk || ak === bk) return true;
  if (a.wordId === b.wordId && a.wordId !== "") return true;
  if (aliases.some(group => group.has(ak) && group.has(bk))) return true;
  if (a.exclusions?.some(x => choiceKey(x) === bk) || b.exclusions?.some(x => choiceKey(x) === ak)) return true;
  const at = tokens(a.label), bt = tokens(b.label);
  if (at.size && bt.size && ([...at].every(x => bt.has(x)) || [...bt].every(x => at.has(x)))) return true;
  if (/[\u3040-\u30ff\u4e00-\u9fff]/u.test(ak + bk) && (ak.includes(bk) || bk.includes(ak))) return true;
  const ag = glosses(a.gloss), bg = glosses(b.gloss);
  return [...ag].some(x => bg.has(x));
}

export const choiceReserve = data.reserve as ChoiceWord[];

/** A small portable RNG; the same seed gives the same result on all clients. */
export function choiceRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
export function choiceHash(text: string): number {
  let hash = 2166136261;
  for (const b of new TextEncoder().encode(text)) hash = Math.imul(hash ^ b, 16777619) >>> 0;
  return hash;
}
export function freshChoiceSeed(): number {
  return Math.floor(Math.random() * 4294967296);
}

/** The fallback ranking deliberately knows less than the server's full scorer. */
export function localChoiceCandidate(target: ChoiceWord, word: ChoiceWord): StudyChoiceCandidate {
  const sameCategory = !!target.category && target.category === word.category;
  const samePos = !!target.pos && target.pos === word.pos;
  return { ...word, tier: sameCategory ? 2 : 3, weight: samePos ? 5 : 1 };
}

function candidateOrder(a: StudyChoiceCandidate, b: StudyChoiceCandidate): number {
  return a.tier - b.tier || b.weight - a.weight ||
    (choiceKey(a.label) < choiceKey(b.label) ? -1 : choiceKey(a.label) > choiceKey(b.label) ? 1 : 0);
}

/** At most 12 mutually compatible choices per tier; retain all tiers for retries. */
export function prepareChoiceCandidates(
  target: ChoiceWord, input: StudyChoiceCandidate[],
): StudyChoiceCandidate[] {
  const result: StudyChoiceCandidate[] = [];
  const counts = new Map<number, number>();
  // A reserve copy must never erase a stricter live synonym/gloss exclusion.
  const merged = new Map<string, StudyChoiceCandidate>();
  for (const c of input) {
    const key = `${c.language}:${choiceKey(c.label)}`;
    const old = merged.get(key);
    if (!old) { merged.set(key, { ...c }); continue; }
    const preferred = candidateOrder(old, c) <= 0 ? old : c;
    merged.set(key, { ...preferred, gloss: [old.gloss, c.gloss].filter(Boolean).join(" / "),
      exclusions: [...new Set([...(old.exclusions ?? []), ...(c.exclusions ?? [])])] });
  }
  for (const c of [...merged.values()].sort(candidateOrder)) {
    if (c.language !== target.language || !Number.isFinite(c.weight) || c.weight <= 0 ||
        !Number.isInteger(c.tier) || c.tier < 1 || c.tier > 4 ||
        (counts.get(c.tier) ?? 0) >= 12 || choicesConflict(target, c) ||
        result.some(other => choicesConflict(other, c))) continue;
    result.push(c);
    counts.set(c.tier, (counts.get(c.tier) ?? 0) + 1);
  }
  return result;
}

export function assembleStudyChoices(
  target: ChoiceWord,
  candidates: StudyChoiceCandidate[],
  seed: number,
  previous: string[] = [],
): string[] {
  // Reserves are checked AFTER the target and incoming candidates, every time.
  const pool = prepareChoiceCandidates(target, [
    ...candidates,
    ...choiceReserve.map(w => ({ ...w, tier: 4, weight: 1 })),
  ]);
  const random = choiceRandom(seed);
  const picked: StudyChoiceCandidate[] = [];
  const old = new Set(previous.filter(x => choiceKey(x) !== choiceKey(target.label)).map(choiceKey));
  function draw(limit: number, freshOnly: boolean) {
    for (const tier of [1, 2, 3, 4]) {
      const available = pool.filter(c => c.tier === tier && !picked.includes(c) && (!freshOnly || !old.has(choiceKey(c.label))));
      while (picked.length < limit && available.length) {
        let ticket = random() * available.reduce((sum, c) => sum + c.weight, 0);
        let i = 0;
        for (; i < available.length - 1; i++) {
          ticket -= available[i].weight;
          if (ticket < 0) break;
        }
        picked.push(available.splice(i, 1)[0]);
      }
    }
  }
  if (old.size) draw(2, true);
  draw(3, false);
  if (picked.length !== 3) throw new Error(`Insufficient fair study choices: ${target.wordId} (${target.language})`);
  const result = [target.label, ...picked.map(c => c.label)];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** A presentation snapshot survives redraws, catalogue refreshes and answer taps. */
export class StudyChoiceSession {
  private readonly snapshots = new Map<string, string[]>();
  private readonly previous = new Map<string, string[]>();
  constructor(private readonly seed = freshChoiceSeed()) {}

  choices(target: ChoiceWord, candidates: StudyChoiceCandidate[], variant = 0): string[] {
    const wordKey = `${target.language}:${target.wordId}`;
    const key = `${wordKey}:${variant}`;
    const cached = this.snapshots.get(key);
    if (cached) return cached;
    const choices = assembleStudyChoices(target, candidates, (this.seed + choiceHash(key)) >>> 0, this.previous.get(wordKey));
    this.snapshots.set(key, choices);
    this.previous.set(wordKey, choices);
    return choices;
  }
}
