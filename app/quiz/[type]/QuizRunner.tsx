"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PronunciationButton from "@/components/PronunciationButton";
import { useWords } from "@/components/WordsProvider";
import { track } from "@/lib/analytics";
import { buildQuizFrom, type QuizQuestion } from "@/lib/quiz";
import { recordQuiz } from "@/lib/storage";
import type { QuizType } from "@/types";

const TITLES: Record<QuizType, { title: string; en: string }> = {
  image: { title: "看圖選英文", en: "Image → English" },
  chinese: { title: "看中文選英文", en: "Chinese → English" },
  spelling: { title: "拼字練習", en: "Spelling" },
};

export default function QuizRunner({ type }: { type: QuizType }) {
  const allWords = useWords();
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [spelling, setSpelling] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [correctIds, setCorrectIds] = useState<string[]>([]);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (allWords.length > 0) setQuestions(buildQuizFrom(allWords, 10));
  }, [allWords]);

  const current = questions[idx];
  const meta = TITLES[type];

  function next() {
    if (idx + 1 >= questions.length) {
      finish();
    } else {
      setIdx((i) => i + 1);
      setChosen(null);
      setSpelling("");
      setRevealed(false);
    }
  }

  function finish() {
    setDone(true);
    recordQuiz({
      type,
      total: questions.length,
      correct: correctIds.length,
      wrongIds,
      date: new Date().toISOString(),
    });
  }

  function judgeChoice(choiceId: string) {
    if (revealed || !current) return;
    setChosen(choiceId);
    setRevealed(true);
    const ok = choiceId === current.answer;
    if (ok) setCorrectIds((arr) => [...arr, current.answer]);
    else setWrongIds((arr) => [...arr, current.answer]);
    track({
      type: "quiz_attempt",
      wordId: current.word.id,
      quizType: type,
      correct: ok,
    });
  }

  function judgeSpelling() {
    if (revealed || !current) return;
    const ans = current.word.word.trim().toLowerCase();
    const input = spelling.trim().toLowerCase();
    setRevealed(true);
    const ok = input === ans;
    if (ok) setCorrectIds((arr) => [...arr, current.answer]);
    else setWrongIds((arr) => [...arr, current.answer]);
    track({
      type: "quiz_attempt",
      wordId: current.word.id,
      quizType: type,
      correct: ok,
    });
  }

  function restart() {
    setQuestions(buildQuizFrom(allWords, 10));
    setIdx(0);
    setChosen(null);
    setSpelling("");
    setRevealed(false);
    setCorrectIds([]);
    setWrongIds([]);
    setDone(false);
  }

  if (questions.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-muted">準備題目中…</div>
    );
  }

  if (done) {
    const total = questions.length;
    const correct = correctIds.length;
    const rate = Math.round((correct / total) * 100);
    const wrongs = wrongIds
      .map((id) => allWords.find((w) => w.id === id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-2xl sm:text-3xl font-bold text-ink text-center">測驗完成！🎉</h1>
        <p className="mt-2 text-center text-muted">{meta.title} · {meta.en}</p>

        <div className="mt-6 rounded-xl2 bg-white shadow-card p-6 text-center">
          <p className="text-5xl font-bold text-sky-accent">{correct}/{total}</p>
          <p className="mt-1 text-muted">正確率 {rate}%</p>
        </div>

        {wrongs.length > 0 && (
          <section className="mt-6">
            <h2 className="text-lg font-bold text-ink">錯題複習</h2>
            <ul className="mt-3 space-y-3">
              {wrongs.map((w) => (
                <li key={w.id}>
                  <Link
                    href={`/word/${w.id}`}
                    className="flex items-center gap-3 rounded-xl bg-white shadow-soft hover:shadow-card px-3 py-3 transition"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={w.imageUrl}
                      alt={w.word}
                      className="w-14 h-14 rounded-lg object-cover bg-cream"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{w.word}</p>
                      <p className="text-sm text-muted">{w.chinese} · {w.pronunciation}</p>
                    </div>
                    <span className="text-sky-accent text-sm shrink-0">複習 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={restart}
            className="px-5 py-3 rounded-full bg-sky-accent text-white font-medium shadow-card hover:bg-sky-accent/90"
          >
            再試一次
          </button>
          <Link
            href="/quiz"
            className="px-5 py-3 rounded-full bg-white text-ink font-medium shadow-card hover:shadow-lg text-center"
          >
            換一種測驗
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <nav className="text-sm text-muted">
        <Link href="/quiz" className="hover:text-ink">
          測驗
        </Link>{" "}
        / <span className="text-ink">{meta.title}</span>
      </nav>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-ink">
          {meta.title}
        </h1>
        <span className="text-sm text-muted">
          第 {idx + 1} / {questions.length} 題
        </span>
      </div>

      <div className="mt-3 h-2 bg-white rounded-full overflow-hidden shadow-soft">
        <div
          className="h-full bg-sky-accent transition-all"
          style={{ width: `${((idx + (revealed ? 1 : 0)) / questions.length) * 100}%` }}
        />
      </div>

      {type === "image" && current && (
        <ImageQuestion
          q={current}
          chosen={chosen}
          revealed={revealed}
          onPick={judgeChoice}
        />
      )}
      {type === "chinese" && current && (
        <ChineseQuestion
          q={current}
          chosen={chosen}
          revealed={revealed}
          onPick={judgeChoice}
        />
      )}
      {type === "spelling" && current && (
        <SpellingQuestion
          q={current}
          revealed={revealed}
          input={spelling}
          onInput={setSpelling}
          onSubmit={judgeSpelling}
        />
      )}

      {revealed && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={next}
            className="px-5 py-3 rounded-full bg-sky-accent text-white font-medium shadow-card hover:bg-sky-accent/90"
          >
            {idx + 1 >= questions.length ? "看結果 →" : "下一題 →"}
          </button>
        </div>
      )}
    </div>
  );
}

function FeedbackBanner({ ok, word }: { ok: boolean; word: string }) {
  return (
    <div
      className={`mt-4 rounded-xl px-4 py-3 text-sm ${
        ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"
      }`}
    >
      {ok ? "🎉 答對了！" : `❌ 答錯了，正確答案是 ${word}`}
    </div>
  );
}

function ChoiceButton({
  label,
  state,
  onClick,
  disabled,
}: {
  label: string;
  state: "default" | "correct" | "wrong" | "muted";
  onClick: () => void;
  disabled: boolean;
}) {
  const style =
    state === "correct"
      ? "bg-emerald-500 text-white border-emerald-500"
      : state === "wrong"
      ? "bg-rose-500 text-white border-rose-500"
      : state === "muted"
      ? "bg-white text-muted border-black/5 opacity-60"
      : "bg-white text-ink border-black/5 hover:border-sky-accent hover:bg-sky-soft";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left rounded-xl border px-4 py-3 transition font-medium ${style}`}
    >
      {label}
    </button>
  );
}

function ImageQuestion({
  q,
  chosen,
  revealed,
  onPick,
}: {
  q: QuizQuestion;
  chosen: string | null;
  revealed: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <>
      <div className="mt-6 rounded-xl2 overflow-hidden shadow-card bg-white aspect-[4/3]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={q.word.imageUrl} alt="問題圖片" className="w-full h-full object-cover" />
      </div>
      <p className="mt-4 text-ink font-medium">這個東西的英文是？</p>
      <div className="mt-3 grid sm:grid-cols-2 gap-3">
        {q.choices.map((c) => {
          const state =
            !revealed
              ? "default"
              : c.id === q.answer
              ? "correct"
              : c.id === chosen
              ? "wrong"
              : "muted";
          return (
            <ChoiceButton
              key={c.id}
              label={c.word}
              state={state}
              onClick={() => onPick(c.id)}
              disabled={revealed}
            />
          );
        })}
      </div>
      {revealed && <FeedbackBanner ok={chosen === q.answer} word={q.word.word} />}
    </>
  );
}

function ChineseQuestion({
  q,
  chosen,
  revealed,
  onPick,
}: {
  q: QuizQuestion;
  chosen: string | null;
  revealed: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <>
      <div className="mt-6 rounded-xl2 bg-white shadow-card p-6 text-center">
        <p className="text-sm text-muted">這個中文意思的英文是？</p>
        <p className="mt-2 text-3xl sm:text-4xl font-bold text-ink">{q.word.chinese}</p>
      </div>
      <div className="mt-4 grid sm:grid-cols-2 gap-3">
        {q.choices.map((c) => {
          const state =
            !revealed
              ? "default"
              : c.id === q.answer
              ? "correct"
              : c.id === chosen
              ? "wrong"
              : "muted";
          return (
            <ChoiceButton
              key={c.id}
              label={c.word}
              state={state}
              onClick={() => onPick(c.id)}
              disabled={revealed}
            />
          );
        })}
      </div>
      {revealed && <FeedbackBanner ok={chosen === q.answer} word={q.word.word} />}
    </>
  );
}

function SpellingQuestion({
  q,
  revealed,
  input,
  onInput,
  onSubmit,
}: {
  q: QuizQuestion;
  revealed: boolean;
  input: string;
  onInput: (v: string) => void;
  onSubmit: () => void;
}) {
  const ok = input.trim().toLowerCase() === q.word.word.toLowerCase();
  return (
    <>
      <div className="mt-6 rounded-xl2 bg-white shadow-card p-4 sm:p-6 flex flex-col sm:flex-row gap-4 items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={q.word.imageUrl}
          alt="提示圖片"
          className="w-full sm:w-40 aspect-[4/3] rounded-lg object-cover bg-cream"
        />
        <div className="flex-1 text-center sm:text-left">
          <p className="text-sm text-muted">輸入這個物件的英文：</p>
          <p className="mt-1 text-2xl sm:text-3xl font-bold text-ink">{q.word.chinese}</p>
          <div className="mt-2 flex items-center gap-2 justify-center sm:justify-start">
            <span className="text-xs text-muted">提示：</span>
            <span className="font-mono text-sm">
              {q.word.word.length} 個字母 · 第一個字母 「{q.word.word[0]}」
            </span>
            <PronunciationButton text={q.word.word} size="sm" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          autoFocus
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !revealed && input.trim()) onSubmit();
          }}
          disabled={revealed}
          placeholder="在此輸入英文…"
          className="flex-1 rounded-full bg-white shadow-card px-5 py-3 outline-none focus:ring-2 ring-sky-accent text-ink disabled:opacity-70"
        />
        <button
          onClick={onSubmit}
          disabled={revealed || !input.trim()}
          className="px-5 py-3 rounded-full bg-sky-accent text-white font-medium shadow-card hover:bg-sky-accent/90 disabled:opacity-40"
        >
          檢查
        </button>
      </div>

      {revealed && <FeedbackBanner ok={ok} word={q.word.word} />}
    </>
  );
}
