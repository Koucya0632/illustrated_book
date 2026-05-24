import type { Word } from "@/types";

export function validateWord(w: Partial<Word>): string | null {
  if (!w.id || !/^[a-z0-9-]+$/.test(w.id)) {
    return "id must be lowercase kebab-case";
  }
  if (!w.word) return "word is required";
  if (!w.chinese) return "chinese is required";
  if (!w.category) return "category is required";
  if (!w.partOfSpeech) return "partOfSpeech is required";
  if (!w.pronunciation) return "pronunciation is required";
  if (!w.imageUrl) return "imageUrl is required";
  if (!Array.isArray(w.examples) || w.examples.length === 0) {
    return "at least one example is required";
  }
  for (const ex of w.examples) {
    if (!ex.en || !ex.zh) return "every example needs en + zh";
  }
  return null;
}
