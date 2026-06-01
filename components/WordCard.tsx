"use client";

import Link from "next/link";
import type { CardWord } from "@/types";
import PronunciationButton from "./PronunciationButton";
import FavoriteButton from "./FavoriteButton";
import { WordTile } from "./tuji/ui";
import { useSettings } from "./SettingsProvider";

// Lite card for list views (/cards, /search, /favorites). Examples / etymology
// / relations are intentionally NOT shown here — they live on the per-word
// page and are server-fetched there. The whole point of the CardWord shape
// is to avoid shipping those heavy fields to clients that don't need them.
export default function WordCard({ word }: { word: CardWord }) {
  const { showZh } = useSettings();

  return (
    <div className="flex flex-col rounded-[18px] bg-white p-3 shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover">
      <Link href={`/word/${word.id}`} className="relative block">
        <div className="absolute right-1 top-1 z-10">
          <FavoriteButton id={word.id} size="sm" />
        </div>
        <WordTile imageUrl={word.imageUrl} word={word.word} height={120} />
      </Link>

      <div className="mt-2.5 flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/word/${word.id}`} className="min-w-0">
            <h3 className="truncate text-[15px] font-extrabold tracking-tight text-tuji-ink">{word.word}</h3>
            {showZh && <p className="truncate text-xs text-tuji-ink3">{word.chinese}</p>}
          </Link>
          <PronunciationButton text={word.word} size="sm" />
        </div>

        <p className="mt-1.5 font-mono text-[11px] text-tuji-ink3">{word.pronunciation}</p>
      </div>
    </div>
  );
}
