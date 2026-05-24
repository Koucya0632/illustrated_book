"use client";

import Link from "next/link";
import { useState } from "react";
import type { Word } from "@/types";
import PronunciationButton from "./PronunciationButton";
import FavoriteButton from "./FavoriteButton";

export default function WordCard({ word }: { word: Word }) {
  const [showExamples, setShowExamples] = useState(false);

  return (
    <div className="group rounded-xl2 bg-white shadow-card hover:shadow-lg transition overflow-hidden flex flex-col">
      <Link
        href={`/word/${word.id}`}
        className="relative block aspect-[4/3] overflow-hidden bg-gradient-to-br from-sky-soft to-mint-soft"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={word.imageUrl}
          alt={word.word}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <div className="absolute top-2 right-2 flex gap-2">
          <FavoriteButton id={word.id} size="sm" />
        </div>
      </Link>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/word/${word.id}`} className="min-w-0">
            <h3 className="text-lg font-semibold text-ink truncate">{word.word}</h3>
            <p className="text-sm text-muted truncate">{word.chinese}</p>
          </Link>
          <PronunciationButton text={word.word} size="sm" />
        </div>

        <p className="mt-2 text-xs font-mono text-muted">{word.pronunciation}</p>

        <button
          onClick={() => setShowExamples((s) => !s)}
          className="mt-3 self-start text-xs font-medium text-sky-accent hover:underline"
        >
          {showExamples ? "收起例句 ▲" : "查看例句 ▼"}
        </button>

        {showExamples && (
          <ul className="mt-2 space-y-2 text-sm">
            {word.examples.slice(0, 2).map((ex, i) => (
              <li key={i} className="rounded-lg bg-cream px-3 py-2">
                <p className="text-ink">{ex.en}</p>
                <p className="text-xs text-muted mt-0.5">{ex.zh}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
