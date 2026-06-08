// Misspelling distractor generator for Step 3 of the new-learn flow
// ("spelling MCQ": apple vs appel / aplle / aple).
//
// Pure function; no DB / network. Called from `attachChoices` so the queue
// API hands the client a ready-to-render `spellingChoices` array. Keeping
// this on the server means we can refine the heuristics here without
// re-shipping the client bundle.
//
// Strategies, in priority order: adjacent swap → single delete → adjacent
// duplicate → common substitution. Each strategy emits all candidates it
// can; we dedupe + cap at `count`. If we still come up short (very short
// inputs, mostly), a vowel-swap fallback fills the rest.

// Letter pairs that English learners commonly confuse (each direction).
// Tuned for distractors that LOOK plausible — picking exotic pairs (e.g.
// q↔z) would betray the misspelling as a non-typo.
const SUBSTITUTIONS: ReadonlyArray<readonly [string, string]> = [
  ["a", "e"],
  ["e", "a"],
  ["e", "i"],
  ["i", "e"],
  ["o", "u"],
  ["u", "o"],
  ["c", "k"],
  ["k", "c"],
  ["s", "c"],
  ["c", "s"],
  ["i", "y"],
  ["y", "i"],
];

const FALLBACK_LETTERS = ["a", "e", "i", "o", "u", "r", "s", "t"];

// Apply a mutator to the last whitespace-or-hyphen-separated token only.
// "ice cream" → mutate "cream" → "ice creem", leaving the prefix intact.
// Mirrors how people actually mistype phrases (the trailing word carries
// the cognitive load) and avoids "Ice cream → eyc cream" style noise.
function mutateLastToken(
  word: string,
  mutate: (token: string) => string[],
): string[] {
  const m = word.match(/^(.*[\s-])(\S+)$/);
  if (!m) return mutate(word);
  const prefix = m[1];
  return mutate(m[2]).map((t) => prefix + t);
}

function swaps(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length - 1; i++) {
    if (word[i] === word[i + 1]) continue;
    out.push(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
  }
  return out;
}

function deletes(word: string): string[] {
  if (word.length <= 2) return [];
  const out: string[] = [];
  for (let i = 0; i < word.length; i++) {
    out.push(word.slice(0, i) + word.slice(i + 1));
  }
  return out;
}

function duplicates(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i++) {
    out.push(word.slice(0, i + 1) + word[i] + word.slice(i + 1));
  }
  return out;
}

function substitutions(word: string): string[] {
  const out: string[] = [];
  const lower = word.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    for (const [from, to] of SUBSTITUTIONS) {
      if (ch !== from) continue;
      // Preserve original case at position i.
      const replacement = word[i] === word[i].toUpperCase() ? to.toUpperCase() : to;
      out.push(word.slice(0, i) + replacement + word.slice(i + 1));
    }
  }
  return out;
}

// Last-resort: replace the final letter with each fallback letter. Used
// only when the input is too short for the regular strategies to yield
// `count` distinct candidates (e.g. "a", "I", "be").
function fallback(word: string): string[] {
  if (word.length === 0) return FALLBACK_LETTERS.slice();
  const last = word[word.length - 1].toLowerCase();
  const head = word.slice(0, -1);
  return FALLBACK_LETTERS.filter((l) => l !== last).map((l) => head + l);
}

export function generateMisspellings(word: string, count = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>([word]);

  const strategies = [swaps, deletes, duplicates, substitutions];
  for (const strat of strategies) {
    if (out.length >= count) break;
    const candidates = shuffle(mutateLastToken(word, strat));
    for (const c of candidates) {
      if (out.length >= count) break;
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
  }

  if (out.length < count) {
    for (const c of mutateLastToken(word, fallback)) {
      if (out.length >= count) break;
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
  }

  return out.slice(0, count);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
