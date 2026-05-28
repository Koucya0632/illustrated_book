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
    return <div className="mt-8 text-tuji-ink3">載入中…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="mt-12 text-center text-tuji-ink3">
        <div className="mb-2 text-5xl">🤍</div>
        <p>還沒有收藏單字。</p>
        <Link
          href="/cards"
          className="mt-4 inline-block rounded-2xl bg-tuji-teal px-5 py-3 text-sm font-extrabold text-white shadow-card"
        >
          去逛圖鑑
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((w) => (
        <WordCard key={w.id} word={w} />
      ))}
    </div>
  );
}
