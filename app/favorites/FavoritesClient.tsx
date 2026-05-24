"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import WordCard from "@/components/WordCard";
import { useWords } from "@/components/WordsProvider";
import { getProgress, subscribe } from "@/lib/storage";
import type { Word } from "@/types";

export default function FavoritesClient() {
  const allWords = useWords();
  const [items, setItems] = useState<Word[] | null>(null);

  useEffect(() => {
    const read = () => {
      const ids = getProgress().favoriteIds;
      setItems(
        ids
          .map((id) => allWords.find((w) => w.id === id))
          .filter((x): x is Word => Boolean(x)),
      );
    };
    read();
    return subscribe(read);
  }, [allWords]);

  if (items === null) {
    return <div className="mt-8 text-muted">載入中…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="mt-12 text-center text-muted">
        <div className="text-5xl mb-2">🤍</div>
        <p>還沒有收藏單字。</p>
        <Link
          href="/"
          className="mt-4 inline-block px-4 py-2 rounded-full bg-sky-accent text-white shadow-card hover:bg-sky-accent/90"
        >
          去逛圖鑑
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map((w) => (
        <WordCard key={w.id} word={w} />
      ))}
    </div>
  );
}
