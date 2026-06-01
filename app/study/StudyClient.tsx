"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PronunciationButton from "@/components/PronunciationButton";
import Mascot from "@/components/tuji/Mascot";
import WordPeekModal from "@/components/WordPeekModal";
import { WordTile, shade, TUJI } from "@/components/tuji/ui";
import { useSettings } from "@/components/SettingsProvider";
import { useCategories } from "@/components/CategoriesProvider";
import { useT } from "@/components/I18n";
import { getSessionId } from "@/lib/analytics";
import { BACKLOG_THRESHOLDS, computeNewLimit } from "@/lib/scheduling";
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
  /** New cards the user has introduced today (Asia/Taipei day). Used to
   *  soft-cap the 新學 button at `dailyGoal`. */
  todayNew: number;
  byStatus: { status: string; c: number }[];
}

type Phase = "landing" | "answer" | "review" | "done";
type Mode = "new" | "review";

// Pause threshold — when stats.due is ≥ this, the landing surfaces a
// warning banner + a confirmation modal on the "new learn" button.
// Derived from the last-but-one band in BACKLOG_THRESHOLDS (the "quartered"
// → "paused" boundary): backlog > 100 is the "please review first" zone.
const BACKLOG_WARN_THRESHOLD =
  BACKLOG_THRESHOLDS[BACKLOG_THRESHOLDS.length - 2].max;

// Per-session review cap. dailyGoal is now reserved for new-card count, so
// review needs its own ceiling — 50 keeps a session under ~30 min and
// matches the queue API's hard limit clamp. Users with > 50 due can press
// "繼續" on the done screen to start the next batch.
const REVIEW_BATCH = 50;

const ALL_RATINGS: Rating[] = ["重來", "困難", "穩定", "熟練"];

// Display label / description i18n keys per rating (the rating VALUE stays the
// Chinese string used as API payload + object key).
const RATING_LABEL_KEY: Record<Rating, string> = {
  重來: "study.rate.again",
  困難: "study.rate.hard",
  穩定: "study.rate.good",
  熟練: "study.rate.easy",
};
const RATING_DESC_KEY: Record<Rating, string> = {
  重來: "study.rateDesc.again",
  困難: "study.rateDesc.hard",
  穩定: "study.rateDesc.good",
  熟練: "study.rateDesc.easy",
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
function suggestRating(elapsedMs: number): Rating {
  if (elapsedMs < 3000) return "熟練";
  if (elapsedMs < 7000) return "穩定";
  return "困難";
}

export default function StudyClient() {
  const [queue, setQueue] = useState<DueCard[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("landing");
  const [mode, setMode] = useState<Mode | null>(null);
  const [pendingNewLearn, setPendingNewLearn] = useState(false);
  const [summary, setSummary] = useState({ 重來: 0, 困難: 0, 穩定: 0, 熟練: 0, completed: 0 });
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [suggestedRating, setSuggestedRating] = useState<Rating | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  const startedAtRef = useRef<number>(0);
  // Synchronous lock so a rapid double-click within the auto-advance window is
  // blocked before React re-renders (state alone has a stale-closure race).
  const answeringRef = useRef(false);

  const { dailyGoal, showZh, studyCategory, studyDecks } = useSettings();
  const categories = useCategories();
  const t = useT();
  const themeName =
    studyCategory === "all" ? null : categories.find((c) => c.id === studyCategory)?.nameZh ?? null;

  const current = queue?.[idx];
  const total = queue?.length ?? 0;
  const wasCorrect = picked !== null && current ? picked === current.card.back : false;

  // Adaptive new-card cap based on backlog. `base` IS the user's dailyGoal
  // — "每日目標" is now defined as the daily new-learning ceiling.
  // `computeNewLimit` shrinks it as stats.due grows past the threshold
  // bands. Review sessions are capped separately (see REVIEW_BATCH).
  const base = dailyGoal;
  const backlog = stats?.due ?? 0;
  const todayNew = stats?.todayNew ?? 0;
  const { limit: newLimit, band: backlogBand } = computeNewLimit(base, backlog);
  const backlogWarn = backlog >= BACKLOG_WARN_THRESHOLD;
  // Soft cap: once the user has introduced `dailyGoal` new cards today,
  // the 新學 button gates behind a "你已完成今天的新學" modal — same
  // override pattern as the backlog warning. Both reasons share the
  // confirmation flow so users see at most one modal at a time.
  const reachedDaily = todayNew >= base && base > 0;
  const needsConfirm = backlogWarn || reachedDaily;

  const decksParam = studyDecks.join(",");

  // Refresh stats only — used by landing to render N/M tiles + the warning
  // banner. Tiny endpoint (one round-trip, no card rows / JOINs).
  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch("/api/study/stats");
      if (!res.ok) return;
      const data = await res.json();
      setStats(data.stats);
    } catch {
      /* ignore — landing copes with null stats by hiding counts */
    }
  }, []);

  // Fetch one session's worth of cards into the queue, for the chosen
  // mode. `overrideNew` forces the legacy `base` even when backlog>=100,
  // so the "I still want to learn new words" path bypasses the cap.
  const loadQueue = useCallback(
    async (m: Mode, opts: { overrideNew?: boolean } = {}) => {
      const limitParam =
        m === "review"
          ? Math.min(REVIEW_BATCH, Math.max(1, backlog))
          : opts.overrideNew
          ? base
          : newLimit;
      if (limitParam <= 0) {
        // No work to do (e.g. picked "new" but backlog paused the cap and
        // user didn't override). Stay on landing; let UI show empty hint.
        setQueue([]);
        return;
      }
      const res = await fetch(
        `/api/study/queue?mode=${m}&limit=${limitParam}` +
          `&category=${encodeURIComponent(studyCategory)}` +
          `&decks=${encodeURIComponent(decksParam)}`,
      );
      const data = await res.json();
      setQueue(data.queue);
      setStats(data.stats);
      setMode(m);
      setIdx(0);
      setPhase("answer");
      setPicked(null);
      setLastFeedback(null);
      setSummary({ 重來: 0, 困難: 0, 穩定: 0, 熟練: 0, completed: 0 });
    },
    [dailyGoal, studyCategory, decksParam, newLimit, base],
  );

  // Refresh stats whenever we land back on the landing screen (mount,
  // after "done", or after the user manually navigates back).
  useEffect(() => {
    if (studyCategory === "all") return;
    if (phase === "landing") refreshStats();
  }, [phase, studyCategory, refreshStats]);

  // 新學 session has no MCQ: there's nothing to "recall" the first time
  // the user sees a word. Every card lands directly in the reveal/rate
  // view (image + English + 認識/知道). Jumping out of `"answer"` the
  // instant a card arrives keeps the existing two-phase machine intact
  // for 複習 without forking the render tree.
  useEffect(() => {
    if (mode === "new" && phase === "answer") setPhase("review");
  }, [mode, phase, idx]);

  function pickReview() {
    if (!stats || stats.due <= 0) return;
    loadQueue("review");
  }

  function pickNewLearn(opts: { override?: boolean } = {}) {
    if (needsConfirm && !opts.override) {
      setPendingNewLearn(true);
      return;
    }
    setPendingNewLearn(false);
    loadQueue("new", { overrideNew: opts.override });
  }

  useEffect(() => {
    if (phase === "answer") {
      startedAtRef.current = performance.now();
      setSuggestedRating(null);
      answeringRef.current = false;
      setSubmitting(false);
    }
  }, [phase, idx]);

  function pickChoice(choice: string) {
    if (phase !== "answer" || !current) return;
    setPicked(choice);
    setPhase("review");
    // Wrong answer no longer auto-records as「重來」— reveal the answer and let
    // the user self-rate (重來 is pre-suggested).
    if (choice !== current.card.back) {
      setSuggestedRating("重來");
      return;
    }
    const elapsed = performance.now() - startedAtRef.current;
    setSuggestedRating(suggestRating(elapsed));
  }

  async function rate(rating: Rating) {
    if (!current) return;
    if (answeringRef.current) return;
    answeringRef.current = true;
    setSubmitting(true);
    const ratedAt = performance.now();
    const responseMs = Math.round(ratedAt - startedAtRef.current);
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
      setLastFeedback(t("study.submitFailed"));
      return;
    }
    setSummary((s) => ({ ...s, [rating]: s[rating] + 1, completed: s.completed + 1 }));
    // Bound the transition to ~0.45s: the feedback beat overlaps the request
    // (which already returned here), so total ≈ max(request, 450ms) instead of
    // request + a fixed 1000ms. Still gated on success (failure stays on card).
    const wait = Math.max(0, 450 - (performance.now() - ratedAt));
    setTimeout(() => {
      setLastFeedback(null);
      if (idx + 1 >= total) setPhase("done");
      else {
        setIdx(idx + 1);
        setPicked(null);
        setPhase("answer");
      }
    }, wait);
  }

  // ── No theme chosen — prompt to pick one (matches the home gate) ──
  if (studyCategory === "all") {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <Mascot pose="think" size={120} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-extrabold text-tuji-ink">{t("home.pickThemeTitle")}</h1>
        <p className="mt-2 text-sm text-tuji-ink3">{t("study.noThemeSub")}</p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/settings"
            className="tuji-press rounded-2xl bg-tuji-teal px-6 py-3 text-sm font-extrabold text-white"
            style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
          >
            {t("home.goPickTheme")}
          </Link>
        </div>
      </div>
    );
  }

  // ── Landing: pick 新學 / 複習 ──
  if (phase === "landing") {
    // Show 0 when the daily quota is already met so the tile doesn't claim
    // the user has more new cards than they'd actually start with. Override
    // would unlock another base-worth via the modal.
    const newCount = reachedDaily ? 0 : Math.max(0, newLimit);
    const reviewCount = stats?.due ?? 0;
    const minutesPer = 0.6; // ~36s per card heuristic, matches home tile
    // Modal copy: backlog overrules dailyDone when both fire (review-first
    // is the bigger SRS-health nudge). All paths share one confirm modal.
    const modalKind: "backlog" | "daily" | null = pendingNewLearn
      ? backlogWarn
        ? "backlog"
        : "daily"
      : null;
    const newTileDimmed = backlogWarn || reachedDaily;
    return (
      <>
        <div className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
          <div className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">
            {themeName}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-tuji-ink sm:text-3xl">
            {t("study.landing.title")}
          </h1>

          {backlogWarn && (
            <div className="mt-5 rounded-2xl border border-tuji-coral/40 bg-tuji-coral/10 px-4 py-3 text-[13px] font-bold text-tuji-coral">
              ⚠️ {t("study.backlog.warnBody", { n: backlog })}
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {/* 新學 */}
            <button
              onClick={() => pickNewLearn()}
              disabled={newCount === 0 && !needsConfirm}
              className="tuji-press group flex flex-col items-start gap-2 rounded-3xl p-5 text-left shadow-card transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: newTileDimmed ? "#F4ECDE" : "#FFFFFF",
                ["--press-shadow" as string]: shade(newTileDimmed ? "#F4ECDE" : "#FFFFFF", -12),
              }}
            >
              <div className="flex w-full items-center justify-between text-[11px] font-extrabold uppercase tracking-[0.14em] text-tuji-ink3">
                <span>📘 {t("study.landing.newLearn")}</span>
                {backlogWarn && <span className="text-tuji-coral">⚠️</span>}
                {!backlogWarn && reachedDaily && (
                  <span className="text-tuji-green">{t("study.daily.doneBadge")}</span>
                )}
              </div>
              <div className="font-display text-5xl font-extrabold leading-none tracking-tight text-tuji-ink">
                {newCount}
              </div>
              <div className="text-[13px] font-bold text-tuji-ink3">
                {newCount > 0
                  ? t("study.landing.minutes", { n: Math.max(1, Math.round(newCount * minutesPer)) })
                  : t("study.landing.newEmpty")}
              </div>
              <div className="mt-1 flex w-full items-center justify-between text-[11px] font-extrabold uppercase tracking-[0.1em] text-tuji-ink3">
                <span>{t("study.daily.chip", { n: todayNew, g: base })}</span>
                <span>
                  {backlogBand === "halved" && "½"}
                  {backlogBand === "quartered" && "¼"}
                  {backlogBand === "paused" && t("study.backlog.warnTitle")}
                </span>
              </div>
            </button>

            {/* 複習 */}
            <button
              onClick={pickReview}
              disabled={reviewCount === 0}
              className="tuji-press group flex flex-col items-start gap-2 rounded-3xl bg-tuji-teal p-5 text-left text-white shadow-card transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
            >
              <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/80">
                🔁 {t("study.landing.review")}
              </div>
              <div className="font-display text-5xl font-extrabold leading-none tracking-tight">
                {reviewCount}
              </div>
              <div className="text-[13px] font-bold text-white/90">
                {reviewCount > 0
                  ? t("study.landing.minutes", { n: Math.max(1, Math.round(reviewCount * minutesPer)) })
                  : t("study.landing.reviewEmpty")}
              </div>
            </button>
          </div>

          <div className="mt-6 flex justify-center gap-2.5">
            <Link
              href="/"
              className="rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-tuji-ink shadow-card"
            >
              {t("study.backHome")}
            </Link>
          </div>
        </div>

        {/* Confirmation modal — backlog warning OR daily-done overflow */}
        {modalKind && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-tuji-ink/55 px-5">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-cardHover">
              <div className="text-base font-extrabold tracking-tight text-tuji-ink">
                {modalKind === "backlog"
                  ? t("study.backlog.warnTitle")
                  : t("study.daily.doneTitle")}
              </div>
              <p className="mt-2 text-sm text-tuji-ink2">
                {modalKind === "backlog"
                  ? t("study.backlog.warnBody", { n: backlog })
                  : t("study.daily.doneBody", { n: todayNew, g: base })}
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                {modalKind === "backlog" && (
                  <button
                    onClick={() => {
                      setPendingNewLearn(false);
                      pickReview();
                    }}
                    className="tuji-press rounded-2xl bg-tuji-teal py-3 text-sm font-extrabold text-white"
                    style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
                  >
                    {t("study.backlog.preferReview")}
                  </button>
                )}
                <button
                  onClick={() => pickNewLearn({ override: true })}
                  className={
                    modalKind === "backlog"
                      ? "rounded-2xl bg-tuji-bg py-3 text-sm font-bold text-tuji-ink2"
                      : "tuji-press rounded-2xl bg-tuji-teal py-3 text-sm font-extrabold text-white"
                  }
                  style={
                    modalKind === "daily"
                      ? { ["--press-shadow" as string]: shade(TUJI.teal, -16) }
                      : undefined
                  }
                >
                  {t("study.backlog.proceedAnyway")}
                </button>
                <button
                  onClick={() => setPendingNewLearn(false)}
                  className="rounded-2xl bg-white py-2.5 text-sm font-bold text-tuji-ink3"
                >
                  {t("study.exit")}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Loading ──
  if (!queue) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-tuji-ink3">
        <Mascot pose="think" size={88} />
        <p className="text-sm font-bold">{t("study.loading")}</p>
      </div>
    );
  }

  // ── Empty (nothing due) ──
  if (queue.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <Mascot pose="sleep" size={120} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-extrabold text-tuji-ink">
          {themeName ? t("study.emptyTitleTheme", { theme: themeName }) : t("study.emptyTitle")}
        </h1>
        <p className="mt-2 text-sm text-tuji-ink3">
          {t("study.emptySub")}
          {stats && (
            <>
              <br />
              {t("study.emptyStats", { total: stats.total, seen: stats.seen, new: stats.new })}
            </>
          )}
        </p>
        <div className="mt-6 flex justify-center gap-2.5">
          <Link href="/" className="rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-tuji-ink shadow-card">
            {t("study.backHome")}
          </Link>
          <button
            onClick={() => {
              setQueue(null);
              setMode(null);
              setPhase("landing");
            }}
            className="tuji-press rounded-2xl bg-tuji-teal px-5 py-3 text-sm font-extrabold text-white"
            style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
          >
            {t("study.recheck")}
          </button>
        </div>
      </div>
    );
  }

  // ── Done summary ──
  if (phase === "done") {
    const r = summary;
    // 新學 session only ever fills two buckets (穩定 = 認識, 困難 = 知道),
    // so show two tiles labelled 認識/知道 instead of four with two zeros.
    // 複習 keeps the four SRS buckets unchanged.
    const tiles: { value: number; color: string; labelKey: string }[] =
      mode === "new"
        ? [
            { value: r.穩定, color: TUJI.green, labelKey: "study.newRate.know" },
            { value: r.困難, color: "#A86214", labelKey: "study.newRate.aware" },
          ]
        : [
            { value: r.重來, color: TUJI.coral, labelKey: RATING_LABEL_KEY["重來"] },
            { value: r.困難, color: "#9A6612", labelKey: RATING_LABEL_KEY["困難"] },
            { value: r.穩定, color: TUJI.teal, labelKey: RATING_LABEL_KEY["穩定"] },
            { value: r.熟練, color: TUJI.green, labelKey: RATING_LABEL_KEY["熟練"] },
          ];
    const tileGridClass =
      mode === "new" ? "mt-6 grid grid-cols-2 gap-3" : "mt-6 grid grid-cols-4 gap-3";
    return (
      <div className="mx-auto max-w-xl px-5 py-12 text-center">
        <Mascot pose="cheer" size={120} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-extrabold text-tuji-ink">{t("study.doneTitle")}</h1>
        <p className="mt-1 text-sm text-tuji-ink3">{t("study.doneCount", { n: r.completed })}</p>
        <div className={tileGridClass}>
          {tiles.map((tile, i) => (
            <div key={i} className="rounded-2xl bg-white p-3 shadow-card">
              <div className="font-display text-2xl font-extrabold" style={{ color: tile.color }}>
                {tile.value}
              </div>
              <div className="mt-1 text-xs font-bold text-tuji-ink3">{t(tile.labelKey)}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-center gap-2.5">
          <button
            onClick={() => {
              setQueue(null);
              setMode(null);
              setPhase("landing");
            }}
            className="tuji-press rounded-2xl bg-tuji-teal px-5 py-3 text-sm font-extrabold text-white"
            style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
          >
            {t("study.continue")}
          </button>
          <Link href="/progress" className="rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-tuji-ink shadow-card">
            {t("study.seeProgress")}
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
          aria-label={t("study.exit")}
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
              {mode === "new"
                ? t("study.newLearn.bubble")
                : revealed
                ? t("study.bubbleReveal")
                : t("study.bubbleAsk")}
            </div>
          </div>

          <div className="relative rounded-[28px] bg-white p-5 shadow-cardHover">
            <WordTile imageUrl={current.word.image_url} word={current.word.word} height={280} rounded={20} />
            {revealed && wasCorrect && (
              <span
                className="absolute right-9 top-9 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-extrabold text-white"
                style={{ background: TUJI.green }}
              >
                ✓ {t("study.correct")}
              </span>
            )}
            <div className="mt-3.5 flex items-center gap-3.5 px-1">
              <PronunciationButton text={current.card.back} size="lg" />
              <div className="min-w-0">
                <div className="text-xs font-extrabold uppercase tracking-[0.08em] text-tuji-ink3">
                  {revealed ? t("study.correctPron") : t("study.listenPron")}
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
            <>
              <div className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.14em] text-tuji-ink3">
                {t("study.pickEnglish")}
              </div>
              <div className="flex flex-col gap-3">
                {(current.choices ?? []).map((c, i) => {
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
                {current.card.explanation && (
                  <div className="mt-3 rounded-xl bg-tuji-bg px-3.5 py-2.5 text-[13px] text-tuji-ink2">
                    💡 {current.card.explanation}
                  </div>
                )}
                <button
                  onClick={() => setPeekId(current.word.id)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-extrabold text-tuji-teal"
                >
                  {t("study.wordDetail")}
                </button>
              </div>

              {/* Rating — 2-button self-rate for 新學 (認識 / 知道), 4-button
                  SRS scale for 複習. Wrong MCQ answers in review mode keep
                  all four buttons (including 重來). 認識 maps to "穩定"
                  internally and 知道 maps to "困難"; the SRS engine and
                  /api/study/answer don't know about the alias. */}
              {mode === "new" ? (
                <>
                  <div className="mb-2.5 text-[13px] font-extrabold uppercase tracking-[0.14em] text-tuji-ink3">
                    {t("study.whenAgain")}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <button
                      onClick={() => rate("穩定")}
                      disabled={submitting}
                      className="tuji-press flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left disabled:opacity-60"
                      style={{ background: TUJI.green, color: "#fff", ["--press-shadow" as string]: shade(TUJI.green, -16) }}
                    >
                      <div className="flex-1">
                        <div className="text-[17px] font-extrabold tracking-tight">{t("study.newRate.know")}</div>
                        <div className="mt-0.5 text-[10px] font-bold opacity-85">
                          {t("study.newRate.knowDesc")}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => rate("困難")}
                      disabled={submitting}
                      className="tuji-press flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left disabled:opacity-60"
                      style={{ background: TUJI.yellow, color: TUJI.ink, ["--press-shadow" as string]: shade(TUJI.yellow, -16) }}
                    >
                      <div className="flex-1">
                        <div className="text-[17px] font-extrabold tracking-tight">{t("study.newRate.aware")}</div>
                        <div className="mt-0.5 text-[10px] font-bold opacity-85">
                          {t("study.newRate.awareDesc")}
                        </div>
                      </div>
                    </button>
                  </div>
                  {lastFeedback && (
                    <p className="mt-1 text-center text-[13px] font-bold text-tuji-coral">{lastFeedback}</p>
                  )}
                </>
              ) : (
                <>
                  <div className="mb-2.5 text-[13px] font-extrabold uppercase tracking-[0.14em] text-tuji-ink3">
                    {t("study.whenAgain")}
                    {suggestedRating && (
                      <span className="ml-1 font-bold normal-case tracking-normal text-tuji-ink2">
                        {t("study.suggest", { label: t(RATING_LABEL_KEY[suggestedRating]) })}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {(wasCorrect ? (["困難", "穩定", "熟練"] as const) : ALL_RATINGS).map((rt) => {
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
                            <div className="text-[17px] font-extrabold tracking-tight">{t(RATING_LABEL_KEY[rt])}</div>
                            <div className="mt-0.5 text-[10px] font-bold opacity-85">
                              {st.en} · {t(RATING_DESC_KEY[rt])}
                            </div>
                          </div>
                          {isSuggested && (
                            <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-extrabold">
                              {t("study.suggestBadge")}
                            </span>
                          )}
                        </button>
                      );
                    })}
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

      {/* Running summary — mirrors the done tiles: 2 buckets in new mode,
          4 in review. The summary state itself stays SRS-keyed; only the
          chips switch their label / which bucket they read. */}
      <div className="flex items-center justify-center gap-3 pb-6 text-xs font-bold text-tuji-ink3">
        <span>{t("study.completed", { done: summary.completed, total })}</span>
        {mode === "new" ? (
          <>
            {summary.穩定 > 0 && (
              <span style={{ color: TUJI.green }}>
                {t("study.newRate.know")} {summary.穩定}
              </span>
            )}
            {summary.困難 > 0 && (
              <span style={{ color: "#A86214" }}>
                {t("study.newRate.aware")} {summary.困難}
              </span>
            )}
          </>
        ) : (
          <>
            {summary.重來 > 0 && <span className="text-tuji-coral">{t("study.rate.again")} {summary.重來}</span>}
            {summary.困難 > 0 && <span style={{ color: "#9A6612" }}>{t("study.rate.hard")} {summary.困難}</span>}
            {summary.穩定 > 0 && <span className="text-tuji-teal">{t("study.rate.good")} {summary.穩定}</span>}
            {summary.熟練 > 0 && <span className="text-tuji-green">{t("study.rate.easy")} {summary.熟練}</span>}
          </>
        )}
      </div>

      {peekId && <WordPeekModal id={peekId} onClose={() => setPeekId(null)} />}
    </div>
  );
}

