"use client";

import { useState } from "react";

export interface SceneTryChoice {
  id: string;
  text: string;
  correct: boolean;
}

export interface SceneTryCopy {
  label: string;
  tag: string;
  asks: string;
  groupLabel: string;
  prompt: string;
  right: string;
  wrong: string;
  reply: string;
  explain: string;
}

/**
 * One listening question from the 便利商店結帳 scene, playable on the landing
 * page. Text only: the app plays the clerk's line as audio, which this page
 * does not ship. Copy arrives already localized from the server.
 */
export default function SceneTry({
  question,
  response,
  choices,
  copy,
}: {
  question: string;
  response: string;
  choices: SceneTryChoice[];
  copy: SceneTryCopy;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const answered = picked !== null;

  return (
    <div className="bg-tuji-paper p-6 text-tuji-ink sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-bold text-tuji-ink2">{copy.label}</span>
        <span className="bg-tuji-paper2 px-3 py-1 text-[13px] font-bold text-tuji-ink2">{copy.tag}</span>
      </div>
      <div className="mt-5">
        <div className="text-[13px] font-bold tracking-[0.04em] text-tuji-ink3">{copy.asks}</div>
        <p lang="ja" className="mt-1 font-ja text-3xl font-bold leading-snug sm:text-4xl">
          {question}
        </p>
      </div>
      <div role="group" aria-label={copy.groupLabel} className="mt-5 flex flex-col gap-px bg-tuji-rule">
        {choices.map((c) => {
          const isPicked = picked === c.id;
          const showRight = answered && c.correct;
          const showWrong = isPicked && !c.correct;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={isPicked}
              onClick={() => setPicked(c.id)}
              className={`flex min-h-14 w-full items-center justify-between gap-3 px-5 py-3 text-left text-[17px] font-bold transition duration-120 ${
                showRight
                  ? "bg-tuji-ink text-tuji-paper"
                  : showWrong
                    ? "bg-tuji-paper3 text-tuji-ink2"
                    : "bg-tuji-paper2 text-tuji-ink hover:bg-tuji-paper3"
              }`}
            >
              <span>{c.text}</span>
              {showRight && <span className="shrink-0 text-[13px] font-extrabold">{copy.right}</span>}
              {showWrong && <span className="shrink-0 text-[13px] font-extrabold">{copy.wrong}</span>}
            </button>
          );
        })}
      </div>
      <div aria-live="polite">
        {answered ? (
          <div className="mt-5 border-t border-tuji-rule pt-5">
            <div className="text-[13px] font-bold tracking-[0.04em] text-tuji-ink3">{copy.reply}</div>
            <p lang="ja" className="mt-1 font-ja text-xl font-bold">
              {response}
            </p>
            <p className="mt-2 text-[15px] leading-7 text-tuji-ink2">{copy.explain}</p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-tuji-ink3">{copy.prompt}</p>
        )}
      </div>
    </div>
  );
}
