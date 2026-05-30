"use client";

import { createContext, useContext } from "react";
import type { Category } from "@/types";

const CategoriesContext = createContext<Category[] | null>(null);

export function CategoriesProvider({
  categories,
  children,
}: {
  categories: Category[];
  children: React.ReactNode;
}) {
  return (
    <CategoriesContext.Provider value={categories}>{children}</CategoriesContext.Provider>
  );
}

/** Client-side hook: returns categories already localized to the user's UI
 *  language (server fetched them with the current uiLang). Falls back to an
 *  empty list if no provider is mounted — callers should not normally hit that. */
export function useCategories(): Category[] {
  const ctx = useContext(CategoriesContext);
  return ctx ?? [];
}

export function useCategory(id: string): Category | undefined {
  return useCategories().find((c) => c.id === id);
}
