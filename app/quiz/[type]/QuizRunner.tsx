"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PronunciationButton from "@/components/PronunciationButton";
import Mascot from "@/components/tuji/Mascot";
import { WordTile, shade, TUJI } from "@/components/tuji/ui";
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
    if (idx + 1 >= questions.length) finish();
    else {
      setIdx((i) => i + 1);
      setChosen(null);
      setSpelling("");
      setRevealed(false);
    }
  }

  function finish() {
    setDone(true);
    recordQuiz({ type, total: questions.length, correct: correctIds.length, wrongIds, date: new Date().toISOString() });
  }

  function judgeChoice(choiceId: string) {
    if (revealed || !current) return;
    setChosen(choiceId);
    setRevealed(true);
    const ok = choiceId === current.answer;
    if (ok) setCorrectIds((arr) => [...arr, current.answer]);
    else setWrongIds((arr) => [...arr, current.answer]);
    track({ type: "quiz_attempt", wordId: current.word.id, quizType: type, correct: ok });
  }

  function judgeSpelling() {
    if (revealed || !current) return;
    const ans = current.word.word.trim().toLowerCase();
    const input = spelling.trim().toLowerCase();
    setRevealed(true);
    const ok = input === ans;
    if (ok) setCorrectIds((arr) => [...arr, current.answer]);
    else setWrongIds((arr) => [...arr, current.answer]);
    track({ type: "quiz_attempt", wordId: current.word.id, quizType: type, correct: ok });
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
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-tuji-ink3">
        <Mascot pose="think" size={88} />
        <p className="text-sm font-bold">準備題目中…</p>
      </div>
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
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-7">
        <div className="text-center">
          <Mascot pose="cheer" size={112} className="mx-auto" />
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-tuji-ink sm:text-3xl">測驗完成！🎉</h1>
          <p className="mt-1 text-sm text-tuji-ink3">
            {meta.title} · {meta.en}
          </p>
        </div>

        <div className="mt-6 rounded-[24px] bg-white p-6 text-center shadow-card">
          <p className="font-display text-5xl font-extrabold text-tuji-teal">
            {correct}/{total}
          </p>
          <p className="mt-1 text-sm font-bold text-tuji-ink3">正確率 {rate}%</p>
        </div>

        {wrongs.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-base font-extrabold tracking-tight text-tuji-ink">錯題複習</h2>
            <ul className="flex flex-col gap-2.5">
              {wrongs.map((w) => (
                <li key={w.id}>
                  <Link href={`/word/${w.id}`} className="flex items-center gap-3 rounded-[14px] bg-white px-3 py-3 shadow-soft transition hover:shadow-card">
                    <div className="w-14 shrink-0">
                      <WordTile imageUrl={w.imageUrl} word={w.word} height={56} rounded={10} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold text-tuji-ink">{w.word}</p>
                      <p className="text-sm text-tuji-ink3">
                        {w.chinese} · {w.pronunciation}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-extrabold text-tuji-teal">複習 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            onClick={restart}
            className="tuji-press rounded-2xl bg-tuji-teal px-6 py-3 text-sm font-extrabold text-white"
            style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
          >
            再試一次
          </button>
          <Link href="/quiz" className="rounded-2xl bg-white px-6 py-3 text-center text-sm font-extrabold text-tuji-ink shadow-card">
            換一種測驗
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 sm:px-7">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold text-tuji-ink3">
        <Link href="/quiz" className="hover:text-tuji-ink">
          測驗
        </Link>
        <span>›</span>
        <span className="font-extrabold text-tuji-ink">{meta.title}</span>
        <span className="ml-auto font-extrabold text-tuji-ink">
          {idx + 1} / {questions.length}
        </span>
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-white shadow-soft">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${((idx + (revealed ? 1 : 0)) / questions.length) * 100}%`,
            background: `linear-gradient(90deg, ${TUJI.coral}, ${TUJI.yellow})`,
          }}
        />
      </div>

      {type === "image" && current && <ImageQuestion q={current} chosen={chosen} revealed={revealed} onPick={judgeChoice} />}
      {type === "chinese" && current && <ChineseQuestion q={current} chosen={chosen} revealed={revealed} onPick={judgeChoice} />}
      {type === "spelling" && current && (
        <SpellingQuestion q={current} revealed={revealed} input={spelling} onInput={setSpelling} onSubmit={judgeSpelling} />
      )}

      {revealed && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={next}
            className="tuji-press rounded-2xl bg-tuji-teal px-6 py-3 text-sm font-extrabold text-white"
            style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
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
      className="mt-4 rounded-2xl px-4 py-3 text-sm font-bold"
      style={ok ? { background: "#E8F5EC", color: TUJI.green } : { background: "#FBE6E1", color: TUJI.coral }}
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
  const base = "w-full rounded-2xl px-4 py-3.5 text-left text-[17px] font-extrabold tracking-tight transition disabled:cursor-default";
  if (state === "correct")
    return (
      <button onClick={onClick} disabled={disabled} className={base} style={{ background: TUJI.green, color: "#fff" }}>
        {label}
      </button>
    );
  if (state === "wrong")
    return (
      <button onClick={onClick} disabled={disabled} className={base} style={{ background: TUJI.coral, color: "#fff" }}>
        {label}
      </button>
    );
  if (state === "muted")
    return (
      <button onClick={onClick} disabled={disabled} className={`${base} bg-white text-tuji-ink4 opacity-60`}>
        {label}
      </button>
    );
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} tuji-press bg-white text-tuji-ink hover:bg-tuji-tealS`}
      style={{ ["--press-shadow" as string]: "rgba(15,26,26,0.12)" }}
    >
      {label}
    </button>
  );
}

function choiceState(revealed: boolean, isAnswer: boolean, isChosen: boolean): "default" | "correct" | "wrong" | "muted" {
  if (!revealed) return "default";
  if (isAnswer) return "correct";
  if (isChosen) return "wrong";
  return "muted";
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
      <div className="mt-6 rounded-[24px] bg-white p-4 shadow-card">
        <WordTile imageUrl={q.word.imageUrl} word="問題圖片" height={280} rounded={18} />
      </div>
      <p className="mt-4 font-extrabold text-tuji-ink">這個東西的英文是？</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {q.choices.map((c) => (
          <ChoiceButton
            key={c.id}
            label={c.word}
            state={choiceState(revealed, c.id === q.answer, c.id === chosen)}
            onClick={() => onPick(c.id)}
            disabled={revealed}
          />
        ))}
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
      <div className="mt-6 rounded-[24px] bg-white p-8 text-center shadow-card">
        <p className="text-sm font-bold text-tuji-ink3">這個中文意思的英文是？</p>
        <p className="mt-2 font-display text-4xl font-extrabold tracking-tight text-tuji-ink">{q.word.chinese}</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {q.choices.map((c) => (
          <ChoiceButton
            key={c.id}
            label={c.word}
            state={choiceState(revealed, c.id === q.answer, c.id === chosen)}
            onClick={() => onPick(c.id)}
            disabled={revealed}
          />
        ))}
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
      <div className="mt-6 flex flex-col items-center gap-4 rounded-[24px] bg-white p-5 shadow-card sm:flex-row">
        <div className="w-full sm:w-40 shrink-0">
          <WordTile imageUrl={q.word.imageUrl} word="提示圖片" height={120} rounded={14} />
        </div>
        <div className="flex-1 text-center sm:text-left">
          <p className="text-sm font-bold text-tuji-ink3">輸入這個物件的英文：</p>
          <p className="mt-1 font-display text-3xl font-extrabold tracking-tight text-tuji-ink">{q.word.chinese}</p>
          <div className="mt-2 flex items-center justify-center gap-2 sm:justify-start">
            <span className="text-xs text-tuji-ink3">提示：</span>
            <span className="font-mono text-sm text-tuji-ink2">
              {q.word.word.length} 個字母 · 開頭「{q.word.word[0]}」
            </span>
            <PronunciationButton text={q.word.word} size="sm" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2.5">
        <input
          autoFocus
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !revealed && input.trim()) onSubmit();
          }}
          disabled={revealed}
          placeholder="在此輸入英文…"
          className="flex-1 rounded-xl bg-white px-5 py-3 text-tuji-ink shadow-soft outline-none focus:ring-2 focus:ring-tuji-teal disabled:opacity-70"
        />
        <button
          onClick={onSubmit}
          disabled={revealed || !input.trim()}
          className="tuji-press rounded-xl bg-tuji-teal px-6 py-3 text-sm font-extrabold text-white disabled:opacity-40"
          style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
        >
          檢查
        </button>
      </div>

      {revealed && <FeedbackBanner ok={ok} word={q.word.word} />}
    </>
  );
}
