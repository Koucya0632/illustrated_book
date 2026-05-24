"use client";

import { createContext, useContext } from "react";
import type { Word } from "@/types";

const WordsContext = createContext<Word[] | null>(null);

export function WordsProvider({
  words,
  children,
}: {
  words: Word[];
  children: React.ReactNode;
}) {
  return <WordsContext.Provider value={words}>{children}</WordsContext.Provider>;
}

export function useWords(): Word[] {
  const ctx = useContext(WordsContext);
  return ctx ?? [];
}

export function useWord(id: string): Word | undefined {
  return useWords().find((w) => w.id === id);
}

export function useSearchWords(query: string): Word[] {
  const all = useWords();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return all.filter((w) => {
    const haystack = [
      w.word,
      w.chinese,
      ...(w.alsoKnownAs ?? []),
      w.category,
      ...(w.relatedWords ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
