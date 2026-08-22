import WordsScope from "@/components/WordsScope";

// This route reads the catalogue via `useWords()`, so it provides it. See
// components/WordsScope.tsx for why this is not in the root layout.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <WordsScope>{children}</WordsScope>;
}
