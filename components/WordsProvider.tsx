"use client";

import { createContext, useContext } from "react";
import type { CardWord } from "@/types";

const WordsContext = createContext<CardWord[] | null>(null);

export function WordsProvider({
  words,
  children,
}: {
  words: CardWord[];
  children: React.ReactNode;
}) {
  return <WordsContext.Provider value={words}>{children}</WordsContext.Provider>;
}

export function useWords(): CardWord[] {
  const ctx = useContext(WordsContext);
  return ctx ?? [];
}

export function useWord(id: string): CardWord | undefined {
  return useWords().find((w) => w.id === id);
}
