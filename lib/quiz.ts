import type { Word } from "@/types";

export interface QuizQuestion {
  word: Word;
  choices: Word[];
  answer: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildQuizFrom(source: Word[], count = 10): QuizQuestion[] {
  if (source.length < 4) return [];
  const pool = shuffle(source).slice(0, count);
  return pool.map((w) => {
    const distractors = shuffle(source.filter((x) => x.id !== w.id)).slice(0, 3);
    const choices = shuffle([w, ...distractors]);
    return { word: w, choices, answer: w.id };
  });
}
