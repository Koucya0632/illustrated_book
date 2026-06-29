"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { WordTile, TUJI } from "@/components/tuji/ui";
import type { Rating } from "@/lib/srs";

interface AtlasQueueItem {
  source: "atlas";
  card: {
    id: string;
    card_type: string;
    front: string;
    back: string;
    explanation: string | null;
    deck_key: string;
  };
  state: {
    status: string;
    interval_days: number;
    next_review_at: string;
    review_count: number;
    mistake_count: number;
  } | null;
  item: {
    id: string;
    lemma: string;
    display_zh_hant: string;
    target_language: "en" | "ja";
    image_url: string;
    thumb_url: string;
  };
  mastery: number;
}

const RATINGS: Rating[] = ["重來", "困難", "穩定", "熟練"];
const RATING_STYLE: Record<Rating, { bg: string; fg: string; sub: string }> = {
  重來: { bg: TUJI.coral, fg: "#fff", sub: "再看一次" },
  困難: { bg: TUJI.yellow, fg: TUJI.ink, sub: "有點卡" },
  穩定: { bg: TUJI.teal, fg: "#fff", sub: "記得住" },
  熟練: { bg: TUJI.green, fg: "#fff", sub: "很熟" },
};

export default function AtlasStudyClient() {
  const [queue, setQueue] = useState<AtlasQueueItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAtRef = useRef(Date.now());

  const current = queue[idx];
  const done = !loading && queue.length > 0 && idx >= queue.length;
  const empty = !loading && queue.length === 0;
  const progress = useMemo(
    () => (queue.length > 0 ? Math.round((Math.min(idx, queue.length) / queue.length) * 100) : 0),
    [idx, queue.length],
  );

  async function loadQueue() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/atlas/study/queue?mode=both&limit=20", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "載入複習失敗");
      setQueue(data.queue ?? []);
      setIdx(0);
      setRevealed(false);
      startedAtRef.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入複習失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQueue();
  }, []);

  async function answer(rating: Rating) {
    if (!current || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/atlas/study/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cardId: current.card.id,
          rating,
          responseMs: Date.now() - startedAtRef.current,
          activity: current.card.card_type === "image_recall" ? "image_recall" : "flashcard",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "送出失敗");
      setIdx((value) => value + 1);
      setRevealed(false);
      startedAtRef.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : "送出失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-6 sm:px-7">
      <header className="mb-5 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">
            Atlas Review
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-tuji-ink sm:text-3xl">
            自制圖鑑複習
          </h1>
        </div>
        <Link href="/atlas" className="text-sm font-extrabold text-tuji-teal hover:underline">
          回圖鑑
        </Link>
      </header>

      {error && (
        <div className="mb-4 rounded-[18px] bg-[#FBE6E1] px-4 py-3 text-sm font-bold text-tuji-coral">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[420px] items-center justify-center rounded-[24px] bg-white text-sm font-bold text-tuji-ink3 shadow-soft">
          載入中...
        </div>
      ) : empty ? (
        <div className="rounded-[24px] bg-white p-8 text-center shadow-soft">
          <div className="text-4xl">✓</div>
          <h2 className="mt-3 text-xl font-extrabold text-tuji-ink">目前沒有待複習卡片</h2>
          <Link
            href="/atlas"
            className="mt-5 inline-flex rounded-2xl bg-tuji-yellow px-5 py-3 text-sm font-extrabold text-tuji-ink"
          >
            建立新卡片
          </Link>
        </div>
      ) : done ? (
        <div className="rounded-[24px] bg-tuji-ink p-8 text-center text-white shadow-soft">
          <div className="text-4xl">✓</div>
          <h2 className="mt-3 text-xl font-extrabold">這批自制圖鑑複習完成</h2>
          <button
            onClick={loadQueue}
            className="mt-5 rounded-2xl bg-tuji-yellow px-5 py-3 text-sm font-extrabold text-tuji-ink"
          >
            再載入一批
          </button>
        </div>
      ) : current ? (
        <section className="rounded-[24px] bg-white p-4 shadow-soft sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-tuji-bg">
              <div className="h-full rounded-full bg-tuji-teal" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-extrabold text-tuji-ink3">
              {idx + 1}/{queue.length}
            </span>
          </div>

          <div className="grid gap-5 md:grid-cols-[minmax(240px,420px)_1fr] md:items-center">
            <WordTile imageUrl={current.item.image_url} word={current.item.lemma} height={360} rounded={20} fit="contain" />
            <div>
              <div className="rounded-[20px] bg-tuji-bg p-5">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-tuji-ink3">
                  {current.card.card_type}
                </div>
                <div className="mt-2 text-lg font-extrabold text-tuji-ink">
                  {revealed ? current.card.back : current.item.display_zh_hant}
                </div>
                {revealed && current.card.explanation && (
                  <div className="mt-2 text-sm font-semibold text-tuji-ink3">
                    {current.card.explanation}
                  </div>
                )}
                <div className="mt-3 text-xs font-bold text-tuji-ink3">
                  熟練度 {current.mastery} · {current.state?.status ?? "新卡"}
                </div>
              </div>

              {!revealed ? (
                <button
                  onClick={() => setRevealed(true)}
                  className="mt-4 w-full rounded-2xl bg-tuji-teal px-5 py-3 text-sm font-extrabold text-white shadow-card"
                >
                  顯示答案
                </button>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {RATINGS.map((rating) => {
                    const style = RATING_STYLE[rating];
                    return (
                      <button
                        key={rating}
                        onClick={() => answer(rating)}
                        disabled={submitting}
                        className="rounded-2xl px-4 py-3 text-left shadow-card transition hover:-translate-y-0.5 disabled:opacity-50"
                        style={{ background: style.bg, color: style.fg }}
                      >
                        <div className="text-sm font-extrabold">{rating}</div>
                        <div className="text-[11px] font-bold opacity-80">{style.sub}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
