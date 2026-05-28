"use client";

import Link from "next/link";
import { useState } from "react";
import type { Word } from "@/types";
import PronunciationButton from "./PronunciationButton";
import FavoriteButton from "./FavoriteButton";
import { WordTile } from "./tuji/ui";
import { useSettings } from "./SettingsProvider";

export default function WordCard({ word }: { word: Word }) {
  const [showExamples, setShowExamples] = useState(false);
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

        {word.examples.length > 0 && (
          <>
            <button
              onClick={() => setShowExamples((s) => !s)}
              className="mt-2 self-start text-xs font-extrabold text-tuji-teal hover:underline"
            >
              {showExamples ? "收起例句 ▲" : "查看例句 ▼"}
            </button>
            {showExamples && (
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {word.examples.slice(0, 2).map((ex, i) => (
                  <li key={i} className="rounded-lg bg-tuji-bg px-3 py-2">
                    <p className="text-tuji-ink">{ex.en}</p>
                    {showZh && ex.zh && <p className="mt-0.5 text-xs text-tuji-ink3">{ex.zh}</p>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
