"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { pickDailyFrom } from "@/lib/daily";
import { useWords } from "@/components/WordsProvider";
import FavoriteButton from "@/components/FavoriteButton";
import { WordTile } from "./ui";
import type { Word } from "@/types";

// Daily-5 word cards, computed client-side (date-seeded) to avoid a
// SSR/CSR hydration mismatch on the date.
export default function TodayWords() {
  const all = useWords();
  const [items, setItems] = useState<Word[]>([]);
  useEffect(() => {
    setItems(pickDailyFrom(all, 5));
  }, [all]);

  if (items.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-[18px] bg-white/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((w) => (
        <Link
          key={w.id}
          href={`/word/${w.id}`}
          className="group relative rounded-[18px] bg-white p-3 shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover"
        >
          <div className="absolute right-4 top-4 z-10">
            <FavoriteButton id={w.id} size="sm" />
          </div>
          <WordTile imageUrl={w.imageUrl} word={w.word} height={120} />
          <div className="mt-2.5">
            <div className="text-[15px] font-extrabold tracking-tight text-tuji-ink">{w.word}</div>
            <div className="mt-0.5 text-xs text-tuji-ink3">{w.chinese}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
