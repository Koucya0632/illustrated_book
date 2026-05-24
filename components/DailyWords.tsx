"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { pickDailyFrom } from "@/lib/daily";
import PronunciationButton from "./PronunciationButton";
import FavoriteButton from "./FavoriteButton";
import { useWords } from "./WordsProvider";
import type { Word } from "@/types";

export default function DailyWords() {
  // Compute on the client to avoid SSR/CSR hydration mismatch (date may differ).
  const all = useWords();
  const [items, setItems] = useState<Word[]>([]);
  useEffect(() => {
    setItems(pickDailyFrom(all, 5));
  }, [all]);

  if (items.length === 0) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] rounded-xl2 bg-white/60 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {items.map((w) => (
        <Link
          key={w.id}
          href={`/word/${w.id}`}
          className="group rounded-xl2 bg-white p-3 shadow-soft hover:shadow-card transition flex flex-col"
        >
          <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-cream">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={w.imageUrl}
              alt={w.word}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
            <div className="absolute top-1.5 right-1.5">
              <FavoriteButton id={w.id} size="sm" />
            </div>
          </div>
          <div className="mt-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-ink truncate">{w.word}</p>
              <p className="text-xs text-muted truncate">{w.chinese}</p>
            </div>
            <PronunciationButton text={w.word} size="sm" />
          </div>
          {w.examples[0] && (
            <p className="mt-2 text-[11px] text-muted line-clamp-2">{w.examples[0].en}</p>
          )}
        </Link>
      ))}
    </div>
  );
}
