"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PronunciationButton from "@/components/PronunciationButton";
import Mascot from "@/components/tuji/Mascot";
import { WordTile, shade, TUJI } from "@/components/tuji/ui";
import { useSettings } from "@/components/SettingsProvider";
import { categories } from "@/lib/categories";
import { getSessionId } from "@/lib/analytics";
import type { Rating } from "@/lib/srs";

interface ApiCard {
  id: number;
  word_id: string;
  card_type: string;
  front: string;
  back: string;
  explanation: string | null;
  tags: string[];
}
interface ApiState {
  status: string;
  interval_days: number;
  next_review_at: string;
  review_count: number;
  mistake_count: number;
  last_rating: Rating | null;
}
interface ApiWord {
  id: string;
  word: string;
  chinese: string;
  image_url: string;
  pronunciation: string;
  category: string;
}
interface DueCard {
  card: ApiCard;
  state: ApiState | null;
  word: ApiWord;
  choices?: string[];
  mastery?: number;
}

interface Stats {
  total: number;
  seen: number;
  due: number;
  new: number;
  byStatus: { status: string; c: number }[];
}

type Phase = "answer" | "review" | "done";

const RATING_DESCRIPTIONS: Record<Rating, string> = {
  重來: "完全答錯 / 沒印象",
  困難: "想了很久 / 部分對",
  穩定: "答對 / 有點不確定",
  熟練: "立刻答出 / 完整正確",
};

// Tuji bucket styling: bg color + foreground + English label, echoing the
// AGAIN / HARD / GOOD / EASY family.
const RATING_STYLE: Record<Rating, { bg: string; fg: string; en: string }> = {
  重來: { bg: TUJI.coral, fg: "#fff", en: "AGAIN" },
  困難: { bg: TUJI.yellow, fg: TUJI.ink, en: "HARD" },
  穩定: { bg: TUJI.teal, fg: "#fff", en: "GOOD" },
  熟練: { bg: TUJI.green, fg: "#fff", en: "EASY" },
};

const CHOICE_TINTS = [
  { bg: TUJI.tealS, fg: TUJI.teal },
  { bg: "#FFF1E0", fg: "#A86214" },
  { bg: "#F6E6F0", fg: "#9C4D7E" },
  { bg: "#E8F1FB", fg: "#3A6E9F" },
];

// Suggest a rating based on how long it took to answer a correct MCQ.
function suggestRating(elapsedMs: number, cardType: string): Rating {
  const isCloze = cardType === "填空卡";
  if (elapsedMs < (isCloze ? 4000 : 3000)) return "熟練";
  if (elapsedMs < (isCloze ? 8000 : 7000)) return "穩定";
  return "困難";
}

export default function StudyClient() {
  const [queue, setQueue] = useState<DueCard[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("answer");
  const [summary, setSummary] = useState({ 重來: 0, 困難: 0, 穩定: 0, 熟練: 0, completed: 0 });
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [suggestedRating, setSuggestedRating] = useState<Rating | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const startedAtRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Synchronous lock so a rapid double-click within the auto-advance window is
  // blocked before React re-renders (state alone has a stale-closure race).
  const answeringRef = useRef(false);

  const { dailyGoal, showZh, studyCategory } = useSettings();
  const themeName =
    studyCategory === "all" ? null : categories.find((c) => c.id === studyCategory)?.nameZh ?? null;

  const current = queue?.[idx];
  const total = queue?.length ?? 0;
  const isMcq = !!current?.choices && current.choices.length > 0;
  const wasCorrect = picked !== null && current ? picked === current.card.back : false;

  const loadQueue = useCallback(async () => {
    const res = await fetch(
      `/api/study/queue?limit=${dailyGoal}&new=${Math.min(10, dailyGoal)}&category=${encodeURIComponent(studyCategory)}`,
    );
    const data = await res.json();
    setQueue(data.queue);
    setStats(data.stats);
    setIdx(0);
    setPhase("answer");
    setTyped("");
    setPicked(null);
    setLastFeedback(null);
    setSummary({ 重來: 0, 困難: 0, 穩定: 0, 熟練: 0, completed: 0 });
  }, [dailyGoal, studyCategory]);

  useEffect(() => {
    // No specific theme chosen → don't load; the picker prompt renders instead.
    if (studyCategory !== "all") loadQueue();
  }, [loadQueue, studyCategory]);

  useEffect(() => {
    if (phase === "answer") {
      startedAtRef.current = performance.now();
      setSuggestedRating(null);
      answeringRef.current = false;
      setSubmitting(false);
      if (!isMcq) inputRef.current?.focus();
    }
  }, [phase, idx, isMcq]);

  function pickChoice(choice: string) {
    if (phase !== "answer" || !current) return;
    setPicked(choice);
    setPhase("review");
    if (choice !== current.card.back) {
      void rate("重來", true);
      return;
    }
    const elapsed = performance.now() - startedAtRef.current;
    setSuggestedRating(suggestRating(elapsed, current.card.card_type));
  }

  function showAnswer() {
    setPhase("review");
    if (current) {
      const elapsed = performance.now() - startedAtRef.current;
      setSuggestedRating(suggestRating(elapsed, current.card.card_type));
    }
  }

  function skip() {
    if (!current) return;
    if (idx + 1 >= total) setPhase("done");
    else {
      setIdx(idx + 1);
      setTyped("");
      setPicked(null);
      setPhase("answer");
    }
  }

  async function rate(rating: Rating, isAutoFromWrong = false) {
    if (!current) return;
    if (answeringRef.current) return;
    answeringRef.current = true;
    setSubmitting(true);
    const responseMs = Math.round(performance.now() - startedAtRef.current);
    try {
      const res = await fetch("/api/study/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: current.card.id, rating, responseMs, sessionId: getSessionId() }),
      });
      if (!res.ok) throw new Error(`answer ${res.status}`);
    } catch (err) {
      console.warn("[study] answer failed", err);
      answeringRef.current = false;
      setSubmitting(false);
      setLastFeedback("送出失敗，再點一次試試");
      return;
    }
    setSummary((s) => ({ ...s, [rating]: s[rating] + 1, completed: s.completed + 1 }));
    const delay = isAutoFromWrong ? 1800 : 1000;
    setTimeout(() => {
      setLastFeedback(null);
      if (idx + 1 >= total) setPhase("done");
      else {
        setIdx(idx + 1);
        setTyped("");
        setPicked(null);
        setPhase("answer");
      }
    }, delay);
  }

  // ── No theme chosen — prompt to pick one (matches the home gate) ──
  if (studyCategory === "all") {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <Mascot pose="think" size={120} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-extrabold text-tuji-ink">請先選擇學習主題</h1>
        <p className="mt-2 text-sm text-tuji-ink3">到設定選一個主題，才能開始複習。</p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/settings"
            className="tuji-press rounded-2xl bg-tuji-teal px-6 py-3 text-sm font-extrabold text-white"
            style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
          >
            去選主題 →
          </Link>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (!queue) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-tuji-ink3">
        <Mascot pose="think" size={88} />
        <p className="text-sm font-bold">載入卡片中…</p>
      </div>
    );
  }

  // ── Empty (nothing due) ──
  if (queue.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <Mascot pose="sleep" size={120} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-extrabold text-tuji-ink">
          {themeName ? `「${themeName}」沒有到期的卡片` : "今天沒有到期的卡片"}
        </h1>
        <p className="mt-2 text-sm text-tuji-ink3">
          看起來該複習的都做完了。
          {stats && (
            <>
              <br />
              全部 {stats.total} · 看過 {stats.seen} · 還沒學 {stats.new}
            </>
          )}
        </p>
        <div className="mt-6 flex justify-center gap-2.5">
          <Link href="/" className="rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-tuji-ink shadow-card">
            回今天
          </Link>
          <button
            onClick={loadQueue}
            className="tuji-press rounded-2xl bg-tuji-teal px-5 py-3 text-sm font-extrabold text-white"
            style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
          >
            重新檢查
          </button>
        </div>
      </div>
    );
  }

  // ── Done summary ──
  if (phase === "done") {
    const r = summary;
    const tiles: { label: string; value: number; color: string }[] = [
      { label: "重來", value: r.重來, color: TUJI.coral },
      { label: "困難", value: r.困難, color: "#9A6612" },
      { label: "穩定", value: r.穩定, color: TUJI.teal },
      { label: "熟練", value: r.熟練, color: TUJI.green },
    ];
    return (
      <div className="mx-auto max-w-xl px-5 py-12 text-center">
        <Mascot pose="cheer" size={120} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-extrabold text-tuji-ink">本回合完成 🎉</h1>
        <p className="mt-1 text-sm text-tuji-ink3">回答了 {r.completed} 張卡片</p>
        <div className="mt-6 grid grid-cols-4 gap-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-2xl bg-white p-3 shadow-card">
              <div className="font-display text-2xl font-extrabold" style={{ color: t.color }}>
                {t.value}
              </div>
              <div className="mt-1 text-xs font-bold text-tuji-ink3">{t.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-center gap-2.5">
          <button
            onClick={loadQueue}
            className="tuji-press rounded-2xl bg-tuji-teal px-5 py-3 text-sm font-extrabold text-white"
            style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
          >
            繼續複習
          </button>
          <Link href="/progress" className="rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-tuji-ink shadow-card">
            看進度
          </Link>
        </div>
      </div>
    );
  }

  if (!current) return null;
  const pct = ((idx + (phase === "review" ? 0.5 : 0)) / total) * 100;
  const revealed = phase === "review";

  return (
    <div className="relative min-h-[calc(100vh-0px)]">
      {/* Top bar: exit + progress + count */}
      <div className="flex items-center gap-4 px-5 py-5 sm:px-8">
        <Link
          href="/"
          aria-label="離開"
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-xl text-tuji-ink shadow-card"
        >
          ✕
        </Link>
        <div className="mx-auto w-full max-w-xl">
          <div className="h-3 overflow-hidden rounded-full bg-white shadow-inner">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${TUJI.coral}, ${TUJI.yellow})` }}
            />
          </div>
        </div>
        <span className="rounded-full bg-white px-3.5 py-1.5 text-sm font-extrabold text-tuji-ink shadow-card">
          {idx + 1} / {total}
        </span>
      </div>

      {/* Body: 2-col on lg */}
      <div className="mx-auto grid max-w-5xl items-start gap-6 px-5 pb-10 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        {/* Left — stimulus */}
        <div>
          <div className="mb-4 flex items-end gap-3">
            <Mascot pose={revealed ? "cheer" : "think"} size={72} />
            <div className="relative mb-2 rounded-[20px] bg-white px-5 py-3.5 text-lg font-extrabold tracking-tight text-tuji-ink shadow-card">
              {revealed ? "看看答案是…" : "這個是什麼？"}
            </div>
          </div>

          <div className="relative rounded-[28px] bg-white p-5 shadow-cardHover">
            <WordTile imageUrl={current.word.image_url} word={current.word.word} height={280} rounded={20} />
            {revealed && wasCorrect && (
              <span
                className="absolute right-9 top-9 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-extrabold text-white"
                style={{ background: TUJI.green }}
              >
                ✓ 答對
              </span>
            )}
            <div className="mt-3.5 flex items-center gap-3.5 px-1">
              <PronunciationButton text={current.card.back} size="lg" />
              <div className="min-w-0">
                <div className="text-xs font-extrabold uppercase tracking-[0.08em] text-tuji-ink3">
                  {revealed ? "正確發音" : "聽聽看怎麼念"}
                </div>
                <div className="mt-0.5 font-mono text-base font-semibold text-tuji-ink2">
                  {current.word.pronunciation || "—"}
                </div>
              </div>
            </div>
            {/* prompt text for non-image card types (cloze / definition) */}
            {current.card.front && current.card.front !== current.word.word && (
              <p className="mt-3 whitespace-pre-line rounded-2xl bg-tuji-bg px-4 py-3 text-[15px] font-semibold leading-relaxed text-tuji-ink2">
                {current.card.front}
              </p>
            )}
          </div>
        </div>

        {/* Right — interaction */}
        <div>
          {!revealed ? (
            isMcq ? (
              <>
                <div className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.14em] text-tuji-ink3">
                  選對的英文
                </div>
                <div className="flex flex-col gap-3">
                  {current.choices!.map((c, i) => {
                    const tint = CHOICE_TINTS[i % CHOICE_TINTS.length];
                    return (
                      <button
                        key={c}
                        onClick={() => pickChoice(c)}
                        disabled={submitting}
                        className="tuji-press flex items-center gap-4 rounded-[20px] px-5 py-4 text-left disabled:opacity-60"
                        style={{ background: tint.bg, ["--press-shadow" as string]: shade(tint.bg, -10) }}
                      >
                        <span
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white font-mono text-base font-extrabold"
                          style={{ color: tint.fg }}
                        >
                          {i + 1}
                        </span>
                        <span className="flex-1 text-xl font-extrabold tracking-tight" style={{ color: tint.fg }}>
                          {c}
                        </span>
                        <span className="text-lg opacity-55" style={{ color: tint.fg }}>
                          →
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="rounded-[24px] bg-white p-5 shadow-card">
                <div className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.14em] text-tuji-ink3">
                  從記憶中提取答案
                </div>
                <input
                  ref={inputRef}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") showAnswer();
                  }}
                  placeholder="輸入後按 Enter…"
                  className="w-full rounded-xl bg-tuji-bg px-4 py-3 text-tuji-ink outline-none focus:ring-2 focus:ring-tuji-teal"
                />
                <div className="mt-3 flex gap-2.5">
                  <button
                    onClick={showAnswer}
                    className="tuji-press flex-1 rounded-xl bg-tuji-teal py-3 text-sm font-extrabold text-white"
                    style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
                  >
                    顯示答案
                  </button>
                  <button onClick={skip} className="rounded-xl bg-tuji-bg px-4 py-3 text-sm font-bold text-tuji-ink3">
                    跳過
                  </button>
                </div>
              </div>
            )
          ) : (
            <>
              {/* Answer card */}
              <div className="mb-3.5 rounded-[20px] bg-white p-5 shadow-card">
                <div className="font-display text-3xl font-extrabold leading-none tracking-tight text-tuji-ink">
                  {current.card.back}
                </div>
                <div className="mt-2 flex items-center gap-2.5">
                  <span className="font-mono text-[13px] text-tuji-ink2">{current.word.pronunciation}</span>
                  {showZh && <span className="text-xs text-tuji-ink3">· {current.word.chinese}</span>}
                </div>
                {!isMcq && typed.trim() && (
                  <div className="mt-2 text-xs text-tuji-ink3">
                    你的答案：<span className="font-semibold text-tuji-ink">{typed.trim()}</span>
                  </div>
                )}
                {current.card.explanation && (
                  <div className="mt-3 rounded-xl bg-tuji-bg px-3.5 py-2.5 text-[13px] text-tuji-ink2">
                    💡 {current.card.explanation}
                  </div>
                )}
                <Link
                  href={`/word/${current.word.id}`}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-extrabold text-tuji-teal"
                >
                  看完整單字頁 →
                </Link>
              </div>

              {/* Rating */}
              {isMcq && !wasCorrect ? (
                <div className="rounded-[20px] bg-white p-5 text-center shadow-card">
                  <p className="font-bold text-tuji-coral">⊗ 已記錄為「重來」</p>
                  {lastFeedback && <p className="mt-1 text-xs text-tuji-coral">{lastFeedback}</p>}
                </div>
              ) : (
                <>
                  <div className="mb-2.5 text-[13px] font-extrabold uppercase tracking-[0.14em] text-tuji-ink3">
                    多久之後再見它一次？
                    {suggestedRating && (
                      <span className="ml-1 font-bold normal-case tracking-normal text-tuji-ink2">
                        （建議：{suggestedRating}）
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {(isMcq ? (["困難", "穩定", "熟練"] as const) : (Object.keys(RATING_DESCRIPTIONS) as Rating[])).map(
                      (rt) => {
                        const st = RATING_STYLE[rt];
                        const isSuggested = suggestedRating === rt;
                        return (
                          <button
                            key={rt}
                            onClick={() => rate(rt)}
                            disabled={submitting}
                            className={`tuji-press flex items-center gap-3.5 rounded-2xl px-4 py-3 text-left disabled:opacity-60 ${
                              isSuggested ? "ring-2 ring-tuji-ink/30 ring-offset-2" : ""
                            }`}
                            style={{ background: st.bg, color: st.fg, ["--press-shadow" as string]: shade(st.bg, -16) }}
                          >
                            <div className="flex-1">
                              <div className="text-[17px] font-extrabold tracking-tight">{rt}</div>
                              <div className="mt-0.5 text-[10px] font-bold opacity-85">
                                {st.en} · {RATING_DESCRIPTIONS[rt]}
                              </div>
                            </div>
                            {isSuggested && (
                              <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-extrabold">
                                建議
                              </span>
                            )}
                          </button>
                        );
                      },
                    )}
                  </div>
                  {lastFeedback && (
                    <p className="mt-1 text-center text-[13px] font-bold text-tuji-coral">{lastFeedback}</p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Running summary */}
      <div className="flex items-center justify-center gap-3 pb-6 text-xs font-bold text-tuji-ink3">
        <span>已完成 {summary.completed} / {total}</span>
        {summary.重來 > 0 && <span className="text-tuji-coral">重來 {summary.重來}</span>}
        {summary.困難 > 0 && <span style={{ color: "#9A6612" }}>困難 {summary.困難}</span>}
        {summary.穩定 > 0 && <span className="text-tuji-teal">穩定 {summary.穩定}</span>}
        {summary.熟練 > 0 && <span className="text-tuji-green">熟練 {summary.熟練}</span>}
      </div>
    </div>
  );
}

