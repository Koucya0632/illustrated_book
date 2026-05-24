"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PronunciationButton from "@/components/PronunciationButton";
import MasteryBar from "@/components/MasteryBar";
import { masteryLevel } from "@/lib/mastery";
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

interface MasteryDelta {
  before: number;
  after: number;
  delta: number;
  level: { key: string; zhLabel: string; color: string };
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

const RATING_COLOR: Record<Rating, string> = {
  重來: "bg-rose-500 hover:bg-rose-600",
  困難: "bg-amber-500 hover:bg-amber-600",
  穩定: "bg-sky-accent hover:bg-sky-accent/90",
  熟練: "bg-emerald-500 hover:bg-emerald-600",
};

// Suggest a rating based on how long it took to answer a correct MCQ.
// Cloze cards get more time (longer sentence to parse).
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
  const [summary, setSummary] = useState({
    重來: 0, 困難: 0, 穩定: 0, 熟練: 0, completed: 0,
  });
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [masteryDelta, setMasteryDelta] = useState<MasteryDelta | null>(null);
  const [suggestedRating, setSuggestedRating] = useState<Rating | null>(null);
  const startedAtRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const current = queue?.[idx];
  const total = queue?.length ?? 0;
  const isMcq = !!current?.choices && current.choices.length > 0;
  const wasCorrect = picked !== null && current ? picked === current.card.back : false;

  const loadQueue = useCallback(async () => {
    const res = await fetch("/api/study/queue?limit=20&new=10");
    const data = await res.json();
    setQueue(data.queue);
    setStats(data.stats);
    setIdx(0);
    setPhase("answer");
    setTyped("");
    setPicked(null);
    setLastFeedback(null);
    setSummary({ 重來: 0, 困難: 0, 穩定: 0, 熟練: 0, completed: 0 });
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  useEffect(() => {
    if (phase === "answer") {
      startedAtRef.current = performance.now();
      setSuggestedRating(null);
      if (!isMcq) inputRef.current?.focus();
    }
  }, [phase, idx, isMcq]);

  function pickChoice(choice: string) {
    if (phase !== "answer" || !current) return;
    setPicked(choice);
    setPhase("review");
    // If wrong, auto-rate as 重來 (no need to ask user)
    if (choice !== current.card.back) {
      void rate("重來", true);
      return;
    }
    // Correct → suggest rating based on speed
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
    const res = await fetch("/api/study/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: current.card.id, rating }),
    });
    const j = await res.json();
    setSummary((s) => ({
      ...s,
      [rating]: s[rating] + 1,
      completed: s.completed + 1,
    }));
    const penalty = j.next?.penaltyApplied ?? 0;
    const penaltyHint = penalty > 0 ? `  (依錯誤紀錄縮短 ${penalty}%)` : "";
    setLastFeedback(`下次複習：${j.next?.humanized ?? "—"}${penaltyHint}`);
    if (j.mastery) setMasteryDelta(j.mastery as MasteryDelta);
    // Auto-advance after delay
    const delay = isAutoFromWrong ? 1800 : 1000; // give time to see the mastery change
    setTimeout(() => {
      setLastFeedback(null);
      setMasteryDelta(null);
      if (idx + 1 >= total) setPhase("done");
      else {
        setIdx(idx + 1);
        setTyped("");
        setPicked(null);
        setPhase("answer");
      }
    }, delay);
  }

  if (!queue) {
    return <div className="max-w-2xl mx-auto py-16 text-center text-muted">載入卡片中…</div>;
  }

  if (queue.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-6xl">🎉</div>
        <h1 className="mt-4 text-2xl font-bold text-ink">今天沒有到期的卡片</h1>
        <p className="mt-2 text-muted text-sm">
          看起來你已經把該複習的都做完了。{stats && (
            <>
              <br />
              全部卡片 {stats.total} · 你看過 {stats.seen} · 還沒學過 {stats.new}
            </>
          )}
        </p>
        <div className="mt-6 flex gap-2 justify-center">
          <Link href="/" className="px-5 py-3 rounded-full bg-white text-ink shadow-card hover:shadow-lg">回首頁</Link>
          <button onClick={loadQueue} className="px-5 py-3 rounded-full bg-sky-accent text-white shadow-card hover:bg-sky-accent/90">重新檢查</button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const r = summary;
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="text-6xl">🌱</div>
        <h1 className="mt-4 text-2xl font-bold text-ink">本回合完成</h1>
        <p className="mt-1 text-sm text-muted">回答了 {r.completed} 張卡片</p>
        <div className="mt-6 grid grid-cols-4 gap-3">
          <Tile label="重來" value={r.重來} color="text-rose-500" />
          <Tile label="困難" value={r.困難} color="text-amber-600" />
          <Tile label="穩定" value={r.穩定} color="text-sky-accent" />
          <Tile label="熟練" value={r.熟練} color="text-emerald-500" />
        </div>
        <div className="mt-8 flex gap-2 justify-center">
          <button onClick={loadQueue} className="px-5 py-3 rounded-full bg-sky-accent text-white shadow-card hover:bg-sky-accent/90">繼續複習</button>
          <Link href="/me" className="px-5 py-3 rounded-full bg-white text-ink shadow-card hover:shadow-lg">回我的帳號</Link>
        </div>
      </div>
    );
  }

  if (!current) return null;
  const progressPct = ((idx + (phase === "review" ? 0.5 : 0)) / total) * 100;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between text-sm">
        <Link href="/" className="text-muted hover:text-ink">← 離開</Link>
        <span className="text-muted">
          第 <strong className="text-ink">{idx + 1}</strong> / {total} 張
        </span>
      </div>
      <div className="mt-2 h-1.5 bg-white rounded-full overflow-hidden shadow-soft">
        <div className="h-full bg-sky-accent transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Tags / status */}
      <div className="mt-4 flex items-center gap-2 text-xs text-muted flex-wrap">
        <span className="px-2 py-0.5 rounded-full bg-mint-soft text-emerald-700">
          {current.card.card_type}
        </span>
        {isMcq && (
          <span className="px-2 py-0.5 rounded-full bg-sky-soft text-sky-accent">
            多選題
          </span>
        )}
        {current.state?.status && (
          <span className="px-2 py-0.5 rounded-full bg-cream">{current.state.status}</span>
        )}
        {current.card.tags.slice(0, 2).map((t) => (
          <span key={t} className="text-muted">· {t}</span>
        ))}
        {typeof current.mastery === "number" && current.mastery > 0 && (
          <span className="text-muted">· 熟練度 {Math.round(current.mastery)}/100</span>
        )}
        {current.state && current.state.mistake_count > 0 && (
          <span
            className="text-rose-500"
            title="這張卡的歷史錯誤率會降低成長間隔倍率"
          >
            · 錯過 {current.state.mistake_count}/{current.state.review_count} 次
          </span>
        )}
      </div>

      {/* Card */}
      <div className="mt-4 bg-white rounded-xl2 shadow-card p-6">
        <p className="text-xl sm:text-2xl text-ink whitespace-pre-line leading-relaxed">
          {current.card.front}
        </p>

        {/* MCQ mode */}
        {isMcq && (
          <div className="mt-6 grid sm:grid-cols-2 gap-2">
            {current.choices!.map((c) => {
              const isPicked = picked === c;
              const isCorrect = c === current.card.back;
              const revealed = phase === "review";
              let cls =
                "px-4 py-3 rounded-xl border text-left transition font-medium";
              if (!revealed) {
                cls += " bg-white border-black/10 hover:border-sky-accent hover:bg-sky-soft text-ink";
              } else if (isCorrect) {
                cls += " bg-emerald-500 border-emerald-500 text-white";
              } else if (isPicked) {
                cls += " bg-rose-500 border-rose-500 text-white";
              } else {
                cls += " bg-white border-black/5 text-muted opacity-60";
              }
              return (
                <button
                  key={c}
                  onClick={() => pickChoice(c)}
                  disabled={revealed}
                  className={cls}
                >
                  {c}
                </button>
              );
            })}
          </div>
        )}

        {/* Typing mode */}
        {!isMcq && phase === "answer" && (
          <>
            <input
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") showAnswer(); }}
              placeholder="從記憶中提取答案，輸入後按 Enter…"
              className="mt-6 w-full rounded-lg bg-cream px-4 py-3 outline-none focus:ring-2 ring-sky-accent text-ink"
            />
            <div className="mt-3 flex gap-2 text-sm">
              <button onClick={showAnswer} className="flex-1 px-4 py-2 rounded-full bg-sky-accent text-white font-medium shadow-card hover:bg-sky-accent/90">顯示答案</button>
              <button onClick={skip} className="px-4 py-2 rounded-full bg-white text-muted shadow-soft hover:shadow-card">跳過</button>
            </div>
          </>
        )}

        {phase === "review" && (
          <ReviewPanel
            mcq={isMcq}
            wasCorrect={wasCorrect}
            picked={picked}
            typed={typed}
            back={current.card.back}
            explanation={current.card.explanation}
            word={current.word}
          />
        )}
      </div>

      {/* Rating buttons */}
      {phase === "review" && (
        <div className="mt-5">
          {/* MCQ + wrong → already auto-rated as 重來, just show waiting state */}
          {isMcq && !wasCorrect && (
            <div className="text-center text-sm">
              <p className="text-rose-500 font-medium">⊗ 已記錄為「重來」</p>
              {masteryDelta && (
                <p className="mt-2 text-xs text-muted">
                  熟練度 {masteryDelta.before} → <strong className="text-ink">{masteryDelta.after}</strong>
                  {masteryDelta.delta !== 0 && (
                    <span className={masteryDelta.delta > 0 ? "text-emerald-600" : "text-rose-500"}>
                      {" "}({masteryDelta.delta > 0 ? "+" : ""}{masteryDelta.delta})
                    </span>
                  )}
                </p>
              )}
              {lastFeedback && <p className="text-muted mt-1">{lastFeedback}</p>}
            </div>
          )}
          {/* MCQ + correct → user picks 困難/穩定/熟練 granularity */}
          {isMcq && wasCorrect && (
            <>
              <p className="text-sm text-muted text-center mb-2">
                答對！這題對你來說有多容易？
                {suggestedRating && (
                  <span className="ml-1 text-xs">
                    （依答題速度建議：<strong className="text-ink">{suggestedRating}</strong>）
                  </span>
                )}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(["困難", "穩定", "熟練"] as const).map((r) => {
                  const isSuggested = suggestedRating === r;
                  return (
                    <button
                      key={r}
                      onClick={() => rate(r)}
                      className={`relative px-3 py-3 rounded-xl text-white shadow-card transition ${RATING_COLOR[r]} ${
                        isSuggested ? "ring-4 ring-offset-2 ring-ink/30 scale-[1.02]" : ""
                      }`}
                    >
                      {isSuggested && (
                        <span className="absolute -top-2 -right-2 bg-ink text-white text-[10px] px-1.5 py-0.5 rounded-full shadow">
                          建議
                        </span>
                      )}
                      <div className="font-bold">{r}</div>
                      <div className="text-[10px] opacity-90 mt-0.5">{RATING_DESCRIPTIONS[r]}</div>
                    </button>
                  );
                })}
              </div>
              {masteryDelta && (
                <p className="mt-3 text-center text-xs text-muted">
                  熟練度 {masteryDelta.before} → <strong className="text-ink">{masteryDelta.after}</strong>
                  {masteryDelta.delta !== 0 && (
                    <span className={masteryDelta.delta > 0 ? "text-emerald-600" : "text-rose-500"}>
                      {" "}({masteryDelta.delta > 0 ? "+" : ""}{masteryDelta.delta})
                    </span>
                  )}
                </p>
              )}
              {lastFeedback && (
                <p className="mt-1 text-center text-sm text-emerald-700">{lastFeedback}</p>
              )}
            </>
          )}
          {/* Typing mode → full 4-button self-rate */}
          {!isMcq && (
            <>
              <p className="text-sm text-muted text-center mb-2">
                你的答案跟標準相比如何？
                {suggestedRating && (
                  <span className="ml-1 text-xs">
                    （依答題速度建議：<strong className="text-ink">{suggestedRating}</strong>）
                  </span>
                )}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(RATING_DESCRIPTIONS) as Rating[]).map((r) => {
                  const isSuggested = suggestedRating === r;
                  return (
                    <button
                      key={r}
                      onClick={() => rate(r)}
                      className={`relative px-3 py-3 rounded-xl text-white shadow-card transition ${RATING_COLOR[r]} ${
                        isSuggested ? "ring-4 ring-offset-2 ring-ink/30 scale-[1.02]" : ""
                      }`}
                    >
                      {isSuggested && (
                        <span className="absolute -top-2 -right-2 bg-ink text-white text-[10px] px-1.5 py-0.5 rounded-full shadow">
                          建議
                        </span>
                      )}
                      <div className="font-bold">{r}</div>
                      <div className="text-[10px] opacity-90 mt-0.5">{RATING_DESCRIPTIONS[r]}</div>
                    </button>
                  );
                })}
              </div>
              {lastFeedback && (
                <p className="mt-3 text-center text-sm text-emerald-700">{lastFeedback}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Running session summary */}
      <div className="mt-6 flex items-center justify-center gap-3 text-xs text-muted">
        <span>已完成 {summary.completed} / {total}</span>
        {summary.重來 > 0 && <span className="text-rose-500">重來 {summary.重來}</span>}
        {summary.困難 > 0 && <span className="text-amber-600">困難 {summary.困難}</span>}
        {summary.穩定 > 0 && <span className="text-sky-accent">穩定 {summary.穩定}</span>}
        {summary.熟練 > 0 && <span className="text-emerald-500">熟練 {summary.熟練}</span>}
      </div>
    </div>
  );
}

function Tile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-soft p-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
    </div>
  );
}

function ReviewPanel({
  mcq,
  wasCorrect,
  picked,
  typed,
  back,
  explanation,
  word,
}: {
  mcq: boolean;
  wasCorrect: boolean;
  picked: string | null;
  typed: string;
  back: string;
  explanation: string | null;
  word: ApiWord;
}) {
  return (
    <div className="mt-5 border-t border-black/5 pt-5 space-y-4">
      {mcq ? (
        <div>
          <p className="text-xs text-muted">你的選擇</p>
          <p className={`mt-1 font-medium ${wasCorrect ? "text-emerald-700" : "text-rose-600"}`}>
            {wasCorrect ? "✓ " : "✗ "}
            {picked}
          </p>
        </div>
      ) : (
        typed.trim() && (
          <div>
            <p className="text-xs text-muted">你的答案</p>
            <p className="mt-1 text-ink">{typed.trim()}</p>
          </div>
        )
      )}
      <div>
        <p className="text-xs text-muted">標準答案</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="text-xl font-semibold text-ink">{back}</p>
          <PronunciationButton text={back} size="sm" />
        </div>
      </div>
      {explanation && (
        <p className="text-sm bg-cream rounded-lg px-3 py-2 text-ink/80">💡 {explanation}</p>
      )}
      <Link href={`/word/${word.id}`} className="inline-flex items-center gap-2 text-xs text-muted hover:text-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={word.image_url} alt={word.word} className="w-8 h-8 rounded object-cover bg-cream" />
        看完整單字頁 →
      </Link>
    </div>
  );
}
