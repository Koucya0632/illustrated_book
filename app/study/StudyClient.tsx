"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PronunciationButton from "@/components/PronunciationButton";
import Mascot from "@/components/tuji/Mascot";
import WordPeekModal from "@/components/WordPeekModal";
import StudyReportModal, { type StudyReportContext } from "@/components/StudyReportModal";
import { WordTile, shade, TUJI } from "@/components/tuji/ui";
import { useSettings } from "@/components/SettingsProvider";
import { useCategories } from "@/components/CategoriesProvider";
import { useWords } from "@/components/WordsProvider";
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
  // Step 3 (拼字) options: correct word + 3 algorithmic misspellings,
  // shuffled. Attached server-side by lib/misspellings + attachChoices.
  spellingChoices?: string[];
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
// New-learn micro-curriculum step. Mode "new" iterates the whole queue
// three times — Step 1 認識 (image + 認識/知道, writes SRS), Step 2 辨認
// (image MCQ over `choices`, no SRS), Step 3 拼字 (image MCQ over
// `spellingChoices`, no SRS). `newStep` is meaningless when mode==="review".
type NewStep = 1 | 2 | 3;

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

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3 w-3 animate-spin rounded-full border-2 border-t-transparent ${
        light ? "border-white/70" : "border-tuji-ink3"
      }`}
    />
  );
}

// Suggest a rating based on how long it took to answer a correct MCQ.
function suggestRating(elapsedMs: number): Rating {
  if (elapsedMs < 3000) return "熟練";
  if (elapsedMs < 7000) return "穩定";
  return "困難";
}

// Roll the candidate word for Step 3. 50% real spelling, 50% one of the
// 3 misspellings from spellingChoices. Defensive fallback to card.back
// if (somehow) no misspellings were attached.
function pickSpellingForCard(card: DueCard): string {
  const correct = card.card.back;
  if (Math.random() < 0.5) return correct;
  const misspells = (card.spellingChoices ?? []).filter((s) => s !== correct);
  if (misspells.length === 0) return correct;
  return misspells[Math.floor(Math.random() * misspells.length)];
}

export default function StudyClient() {
  const [queue, setQueue] = useState<DueCard[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("landing");
  const [mode, setMode] = useState<Mode | null>(null);
  const [pendingNewLearn, setPendingNewLearn] = useState(false);
  // SRS buckets (重來/困難/穩定/熟練 + completed) cover review-mode + new
  // Step 1. step2/step3 tallies only fill during the corresponding new-mode
  // steps; they stay at 0 for review sessions.
  const [summary, setSummary] = useState({
    重來: 0, 困難: 0, 穩定: 0, 熟練: 0, completed: 0,
    step2Correct: 0, step2Wrong: 0,
    step3Correct: 0, step3Wrong: 0,
  });
  const [newStep, setNewStep] = useState<NewStep>(1);
  // Pending-queue model for new-learn Steps 2/3. Holds the queue indices of
  // cards the user hasn't yet answered correctly in the current step.
  // Wrong picks push the head to the back so the same card returns later;
  // correct picks drop it. Step finishes when this becomes empty.
  // Empty when Step 1 is active or mode === "review".
  const [stepQueue, setStepQueue] = useState<number[]>([]);
  // Step 3 (拼字) shows ONE candidate word per card and asks the user to
  // judge correct/wrong. The candidate is rolled 50/50 between the real
  // spelling and a random misspelling, re-rolled on every new card (and
  // on every requeue), so a single card can probe different spellings
  // across its retries.
  const [displayedSpelling, setDisplayedSpelling] = useState<string>("");
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [suggestedRating, setSuggestedRating] = useState<Rating | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  // When `peekId` is opened by a wrong Step 2/3 pick, this flag tells the
  // modal's onClose to run the requeue-and-advance flow (the timer is
  // suppressed in that branch). User-initiated peeks via the "字卡詳情"
  // link leave it false so closing the modal is a no-op for the queue.
  const [peekAdvanceOnClose, setPeekAdvanceOnClose] = useState(false);
  // Which button (新學/複習) is currently fetching its queue — drives the
  // landing-tile spinner so a slow /api/study/queue doesn't look like a dead
  // click. `null` = idle.
  const [loadingMode, setLoadingMode] = useState<Mode | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Stats fetch error — distinct from `stats === null` so we can tell
  // "still loading" from "tried and failed" on the landing screen.
  const [statsError, setStatsError] = useState(false);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const [reportContext, setReportContext] = useState<StudyReportContext | null>(null);
  const startedAtRef = useRef<number>(0);
  // Synchronous lock so a rapid double-click within the auto-advance window is
  // blocked before React re-renders (state alone has a stale-closure race).
  const answeringRef = useRef(false);
  // Latest in-flight queue fetch; abort on re-click or unmount so a stale
  // response can't overwrite a fresh one and the user isn't billed for a
  // dropped request after they navigate away.
  const queueAbortRef = useRef<AbortController | null>(null);

  const {
    dailyGoal,
    showZh,
    studyCategories,
    studyDecks,
    uiLang,
    learningDirection,
  } = useSettings();
  const categories = useCategories();
  const allWords = useWords();
  const t = useT();
  // Pre-resolve display names so the landing / progress labels can render
  // "廚房, 客廳 +1" without re-doing the lookup per phase.
  const themeLabels = studyCategories
    .map((id) => categories.find((c) => c.id === id)?.nameZh)
    .filter((n): n is string => Boolean(n));
  const themeLabel =
    themeLabels.length === 0
      ? null
      : themeLabels.length <= 2
      ? themeLabels.join(", ")
      : `${themeLabels.slice(0, 2).join(", ")} +${themeLabels.length - 2}`;

  // In Steps 2/3 the card to render is dictated by `stepQueue` (which
  // shuffles wrong-answers back to the tail), not by `idx`. Step 1 and
  // review keep using `idx` as before.
  const currentIdx =
    mode === "new" && newStep !== 1 && stepQueue.length > 0
      ? stepQueue[0]
      : idx;
  const current = queue?.[currentIdx];
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
  const categoriesParam = studyCategories.join(",");

  // Refresh stats only — used by landing to render N/M tiles + the warning
  // banner. Tiny endpoint (one round-trip, no card rows / JOINs). Silent
  // single retry on transient failure: stats failures are user-visible (the
  // tiles render 0) so a cold-start blip would lie about backlog.
  const refreshStats = useCallback(async () => {
    const attempt = async () => {
      const url = `/api/study/stats?category=${encodeURIComponent(categoriesParam)}`;
      const res = await fetch(url);
      if (res.ok || (res.status >= 400 && res.status < 500)) return res;
      throw new Error(`HTTP ${res.status}`);
    };
    setStatsError(false);
    try {
      let res: Response;
      try {
        res = await attempt();
      } catch {
        await new Promise((r) => setTimeout(r, 500));
        res = await attempt();
      }
      if (!res.ok) {
        setStatsError(true);
        return;
      }
      const data = await res.json();
      setStats(data.stats);
    } catch {
      // Both attempts failed — surface via statsError so landing can
      // show the retry UI instead of getting stuck on the loader.
      setStatsError(true);
    }
  }, [categoriesParam]);

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
      queueAbortRef.current?.abort();
      const ctrl = new AbortController();
      queueAbortRef.current = ctrl;
      setLoadingMode(m);
      setLoadError(null);
      const url =
        `/api/study/queue?mode=${m}&limit=${limitParam}` +
        `&category=${encodeURIComponent(categoriesParam)}` +
        `&decks=${encodeURIComponent(decksParam)}`;
      // One silent retry on transient failure (network blip / 5xx). Most
      // queue failures we've seen are cold-start or pooler hiccups that
      // succeed on the next try; only show the error banner if both fail.
      // Auth errors (401) and client errors (4xx) skip the retry — they
      // won't fix themselves.
      const attempt = async (): Promise<Response> => {
        const res = await fetch(url, { signal: ctrl.signal });
        if (res.ok || (res.status >= 400 && res.status < 500)) return res;
        throw new Error(`HTTP ${res.status}`);
      };
      try {
        let res: Response;
        try {
          res = await attempt();
        } catch (firstErr) {
          if ((firstErr as Error)?.name === "AbortError") return;
          await new Promise((r) => setTimeout(r, 500));
          if (ctrl.signal.aborted) return;
          res = await attempt();
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setQueue(data.queue);
        setStats(data.stats);
        setMode(m);
        setIdx(0);
        setPhase("answer");
        setPicked(null);
        setLastFeedback(null);
        setNewStep(1);
        setStepQueue([]);
        setDisplayedSpelling("");
        setPeekId(null);
        setPeekAdvanceOnClose(false);
        setSummary({
          重來: 0, 困難: 0, 穩定: 0, 熟練: 0, completed: 0,
          step2Correct: 0, step2Wrong: 0,
          step3Correct: 0, step3Wrong: 0,
        });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setLoadError(t("study.loadFailed"));
      } finally {
        if (queueAbortRef.current === ctrl) {
          queueAbortRef.current = null;
          setLoadingMode(null);
        }
      }
    },
    [dailyGoal, categoriesParam, decksParam, newLimit, base, backlog, t],
  );

  // Abort any in-flight queue fetch on unmount so a late response can't
  // setState on a dead component (and Vercel doesn't bill for the dropped
  // request on the server side either).
  useEffect(() => () => queueAbortRef.current?.abort(), []);

  // Refresh stats whenever we land back on the landing screen (mount,
  // after "done", or after the user manually navigates back).
  useEffect(() => {
    if (studyCategories.length === 0) return;
    if (phase === "landing") refreshStats();
  }, [phase, studyCategories.length, refreshStats]);

  // Theme switch invalidates the old stats (different deck mix, different
  // due/new counts). Drop them so landing falls back to the loader
  // instead of briefly showing the prior theme's numbers. We key the
  // effect on the joined param so swapping the *set* of categories (not
  // just order) triggers it.
  useEffect(() => {
    if (studyCategories.length === 0) return;
    setStats(null);
    setStatsError(false);
  }, [categoriesParam, studyCategories.length]);

  // Initial pending queue for a fresh Step 2 or Step 3.
  function freshStepQueue(): number[] {
    return Array.from({ length: total }, (_, i) => i);
  }

  // Advance the new-learn session forward. Called from:
  //   - rate() at the end of a Step 1 card (next card / start Step 2)
  //   - pickStepChoice when stepQueue drains (start Step 3 / finish)
  // Review mode keeps its own advance branch inside rate().
  function advanceNew() {
    if (newStep === 1) {
      if (idx + 1 < total) {
        setIdx(idx + 1);
        setPicked(null);
        return;
      }
      // Step 1 → Step 2: seed the pending queue with every card.
      setNewStep(2);
      setIdx(0);
      setStepQueue(freshStepQueue());
      setPicked(null);
      return;
    }
    if (newStep === 2) {
      setNewStep(3);
      const fresh = freshStepQueue();
      setStepQueue(fresh);
      // Seed Step 3's candidate so the first card has something to judge
      // — pickStepChoice handles re-seeding on every subsequent advance.
      if (queue && queue[fresh[0]]) {
        setDisplayedSpelling(pickSpellingForCard(queue[fresh[0]]));
      }
      setPicked(null);
      return;
    }
    // Step 3 finished — wrap up.
    setPhase("done");
  }

  // Step 2/3 click handler. No SRS write. Highlights for ~0.8s, then we
  // either pop the head (judgment correct) or rotate it to the back
  // (judgment wrong). Re-clicks during the beat are blocked.
  //
  // Step 2: `choice` is one of the 4 English MCQs — correctness compares
  // it directly to card.back.
  // Step 3: `choice` is the literal "對" / "錯". Correctness depends on
  // whether the user's verdict matches reality (displayedSpelling vs
  // card.back). On every advance Step 3 re-rolls the candidate so retries
  // can probe different spellings of the same card.
  function pickStepChoice(choice: string) {
    if (!current || picked !== null) return;
    setPicked(choice);
    let correct: boolean;
    if (newStep === 3) {
      const isActuallyCorrect = displayedSpelling === current.card.back;
      correct = (choice === "對" && isActuallyCorrect) || (choice === "錯" && !isActuallyCorrect);
    } else {
      correct = choice === current.card.back;
    }
    setSummary((s) => {
      if (newStep === 2) {
        return {
          ...s,
          step2Correct: s.step2Correct + (correct ? 1 : 0),
          step2Wrong: s.step2Wrong + (correct ? 0 : 1),
        };
      }
      if (newStep === 3) {
        return {
          ...s,
          step3Correct: s.step3Correct + (correct ? 1 : 0),
          step3Wrong: s.step3Wrong + (correct ? 0 : 1),
        };
      }
      return s;
    });
    if (!correct) {
      // Step 2/3 wrong → pop the word peek modal so the user can study
      // the card right where they stalled. The 800ms auto-advance is
      // suppressed here; modal close handler runs the requeue + reseed
      // (see the WordPeekModal block at the bottom of this component).
      setPeekId(current.word.id);
      setPeekAdvanceOnClose(true);
      return;
    }
    setTimeout(() => {
      setPicked(null);
      const [, ...rest] = stepQueue;
      if (rest.length === 0) {
        setStepQueue([]);
        advanceNew();
      } else {
        setStepQueue(rest);
        if (newStep === 3 && queue && queue[rest[0]]) {
          setDisplayedSpelling(pickSpellingForCard(queue[rest[0]]));
        }
      }
    }, 800);
  }

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
      if (mode === "new") {
        // Step 1 advance: next card, then Step 2/3, then done. The
        // setPhase("answer") branch below is review-only — new mode keeps
        // phase pinned to "answer" until the final advanceNew → "done".
        advanceNew();
        return;
      }
      if (idx + 1 >= total) setPhase("done");
      else {
        setIdx(idx + 1);
        setPicked(null);
        setPhase("answer");
      }
    }, wait);
  }

  // ── No theme chosen — prompt to pick one (matches the home gate) ──
  if (studyCategories.length === 0) {
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
    // Gate the tile UI on a real stats payload. Without this the new-learn
    // tile renders `dailyGoal` (backlog defaults to 0 → full quota) and the
    // review tile renders 0 — both wrong, both clickable. Once stats arrives
    // we render the tiles and never show this loader again for this mount
    // (subsequent re-entries from /done have stats cached).
    if (stats === null && !statsError) {
      return (
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-5 py-16 text-tuji-ink3 sm:px-8">
          <Mascot pose="think" size={96} />
          <div className="flex items-center gap-2 text-sm font-bold">
            <Spinner />
            <span>{t("study.loading")}</span>
          </div>
        </div>
      );
    }
    if (stats === null && statsError) {
      return (
        <div className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-8">
          <Mascot pose="think" size={96} className="mx-auto" />
          <div className="mt-4 rounded-2xl border border-tuji-coral/40 bg-tuji-coral/10 px-4 py-3 text-[13px] font-bold text-tuji-coral">
            ⚠️ {t("study.loadFailed")}
          </div>
          <div className="mt-5 flex justify-center">
            <button
              onClick={refreshStats}
              className="tuji-press rounded-2xl bg-tuji-teal px-5 py-3 text-sm font-extrabold text-white"
              style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
            >
              {t("study.recheck")}
            </button>
          </div>
        </div>
      );
    }
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
    const showBacklogAdjustment = !reachedDaily && base > 0 && newCount > 0 && newCount < base;
    return (
      <>
        <div className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
          <div className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">
            {themeLabel}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-tuji-ink sm:text-3xl">
            {t("study.landing.title")}
          </h1>

          {backlogWarn && (
            <div className="mt-5 rounded-2xl border border-tuji-coral/40 bg-tuji-coral/10 px-4 py-3 text-[13px] font-bold text-tuji-coral">
              ⚠️ {t("study.backlog.warnBody", { n: backlog })}
            </div>
          )}

          {loadError && (
            <div className="mt-5 rounded-2xl border border-tuji-coral/40 bg-tuji-coral/10 px-4 py-3 text-[13px] font-bold text-tuji-coral">
              ⚠️ {loadError}
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {/* 新學 */}
            <button
              onClick={() => pickNewLearn()}
              disabled={(newCount === 0 && !needsConfirm) || loadingMode !== null}
              aria-busy={loadingMode === "new"}
              className="tuji-press group flex flex-col items-start gap-2 rounded-3xl p-5 text-left shadow-card transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: newTileDimmed ? "#F4ECDE" : "#FFFFFF",
                ["--press-shadow" as string]: shade(newTileDimmed ? "#F4ECDE" : "#FFFFFF", -12),
              }}
            >
              <div className="flex w-full items-center justify-between text-[11px] font-extrabold uppercase tracking-[0.14em] text-tuji-ink3">
                <span>📘 {t("study.landing.newLearn")}</span>
                {loadingMode === "new" && <Spinner />}
                {loadingMode !== "new" && backlogWarn && <span className="text-tuji-coral">⚠️</span>}
                {loadingMode !== "new" && !backlogWarn && reachedDaily && (
                  <span className="text-tuji-green">{t("study.daily.doneBadge")}</span>
                )}
              </div>
              <div className="font-display text-5xl font-extrabold leading-none tracking-tight text-tuji-ink">
                {newCount}
              </div>
              <div className="text-[13px] font-bold text-tuji-ink3">
                {loadingMode === "new"
                  ? t("study.loading")
                  : newCount > 0
                  ? t("study.landing.minutes", { n: Math.max(1, Math.round(newCount * minutesPer)) })
                  : t("study.landing.newEmpty")}
              </div>
              <div className="mt-1 flex w-full items-center justify-between text-[11px] font-extrabold uppercase tracking-[0.1em] text-tuji-ink3">
                <span>{t("study.daily.chip", { n: todayNew, g: base })}</span>
                {backlogBand === "paused" && <span>{t("study.backlog.warnTitle")}</span>}
              </div>
              {showBacklogAdjustment && (
                <div className="mt-1 rounded-2xl bg-white/75 px-3 py-2 text-[12px] font-bold leading-snug text-tuji-coral">
                  {t("study.backlog.adjustedNew", { n: newCount })}
                </div>
              )}
            </button>

            {/* 複習 */}
            <button
              onClick={pickReview}
              disabled={reviewCount === 0 || loadingMode !== null}
              aria-busy={loadingMode === "review"}
              className="tuji-press group flex flex-col items-start gap-2 rounded-3xl bg-tuji-teal p-5 text-left text-white shadow-card transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ ["--press-shadow" as string]: shade(TUJI.teal, -16) }}
            >
              <div className="flex w-full items-center justify-between text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/80">
                <span>🔁 {t("study.landing.review")}</span>
                {loadingMode === "review" && <Spinner light />}
              </div>
              <div className="font-display text-5xl font-extrabold leading-none tracking-tight">
                {reviewCount}
              </div>
              <div className="text-[13px] font-bold text-white/90">
                {loadingMode === "review"
                  ? t("study.loading")
                  : reviewCount > 0
                  ? t("study.landing.minutes", { n: Math.max(1, Math.round(reviewCount * minutesPer)) })
                  : t("study.landing.reviewEmpty")}
              </div>
            </button>
          </div>

          <div className="mt-6 flex justify-center gap-2.5">
            <Link
              href="/today"
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
          {themeLabel ? t("study.emptyTitleTheme", { theme: themeLabel }) : t("study.emptyTitle")}
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
          <Link href="/today" className="rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-tuji-ink shadow-card">
            {t("study.backHome")}
          </Link>
          <button
            onClick={() => {
              // Force the landing loader to reappear: the session just
              // changed todayNew / due counts, and we want fresh numbers
              // before the user can click 新學 / 複習 again. The landing
              // gate (`stats === null && !statsError`) renders the spinner
              // until refreshStats settles.
              setQueue(null);
              setMode(null);
              setStats(null);
              setStatsError(false);
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
    // New-learn done summary: one row per step (認識 / 辨認 / 拼字), each
    // showing two figures — Step 1 splits into 認識 vs 知道, Steps 2/3 into
    // 對 vs 錯. Review keeps the existing 4-bucket SRS tile layout.
    return (
      <div className="mx-auto max-w-xl px-5 py-12 text-center">
        <Mascot pose="cheer" size={120} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-extrabold text-tuji-ink">{t("study.doneTitle")}</h1>
        <p className="mt-1 text-sm text-tuji-ink3">{t("study.doneCount", { n: r.completed })}</p>
        {mode === "new" ? (
          // List the words the user just touched — we want them to leave
          // with "these are the new ones I just learned" rather than per-
          // step accuracy stats. Shows every queue item (Step 2/3 retries
          // keep cycling until correct, so by 'done' the user has seen
          // each word at least 3× regardless of accuracy).
          <div className="mt-6 grid grid-cols-2 gap-2.5 text-left sm:grid-cols-3">
            {queue.map((d) => (
              <div key={d.card.id} className="rounded-2xl bg-white p-2.5 shadow-card">
                <WordTile imageUrl={d.word.image_url} word={d.word.word} height={88} rounded={14} fit="contain" />
                <div className="mt-2 text-sm font-extrabold tracking-tight text-tuji-ink">
                  {d.card.back}
                </div>
                {showZh && d.word.chinese && (
                  <div className="text-[11px] font-bold text-tuji-ink3">
                    {d.word.chinese}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-4 gap-3">
            {[
              { value: r.重來, color: TUJI.coral, labelKey: RATING_LABEL_KEY["重來"] },
              { value: r.困難, color: "#9A6612", labelKey: RATING_LABEL_KEY["困難"] },
              { value: r.穩定, color: TUJI.teal, labelKey: RATING_LABEL_KEY["穩定"] },
              { value: r.熟練, color: TUJI.green, labelKey: RATING_LABEL_KEY["熟練"] },
            ].map((tile, i) => (
              <div key={i} className="rounded-2xl bg-white p-3 shadow-card">
                <div className="font-display text-2xl font-extrabold" style={{ color: tile.color }}>
                  {tile.value}
                </div>
                <div className="mt-1 text-xs font-bold text-tuji-ink3">{t(tile.labelKey)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-8 flex justify-center gap-2.5">
          <button
            onClick={() => {
              // Force the landing loader to reappear: the session just
              // changed todayNew / due counts, and we want fresh numbers
              // before the user can click 新學 / 複習 again. The landing
              // gate (`stats === null && !statsError`) renders the spinner
              // until refreshStats settles.
              setQueue(null);
              setMode(null);
              setStats(null);
              setStatsError(false);
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
  // New-mode progress crosses three steps. Wrong picks in Steps 2/3
  // requeue the card to the tail, so step progress = "cards already
  // finalized" (= total - stepQueue.length), not raw answer count —
  // that keeps the bar monotonic across retries.
  const pct =
    mode === "new"
      ? (() => {
          const stepFrac =
            newStep === 1
              ? (idx + (picked ? 0.5 : 0)) / total
              : total === 0
              ? 1
              : (total - stepQueue.length) / total;
          return (((newStep - 1) + stepFrac) / 3) * 100;
        })()
      : ((idx + (phase === "review" ? 0.5 : 0)) / total) * 100;
  // What "revealed" means depends on mode:
  //   - Review: phase has cleanly switched from answer → review after a pick.
  //   - New Step 1: always revealed (image + English answer card + 認識/知道).
  //   - New Step 2/3: never revealed — the MCQ grid IS the answer surface,
  //     and a picked card stays in the grid view with highlighting.
  const revealed = mode === "new" ? newStep === 1 : phase === "review";
  // Are we showing the MCQ grid (vs the post-reveal answer card)?
  const inMcqView = mode === "new" ? newStep !== 1 : phase === "answer";
  // Right-column 4-MCQ choices for Step 2 + review. Step 3 has its own
  // judgment UI driven by `displayedSpelling`, so it doesn't read this.
  const mcqChoices = current.choices ?? [];

  function openReport() {
    if (!mode || !current) return;
    const reportPhase =
      mode === "new"
        ? newStep === 1
          ? "recognize"
          : newStep === 2
          ? "identify"
          : "spell"
        : phase === "review"
        ? "reveal"
        : "answer";
    setReportContext({
      requestId: crypto.randomUUID(),
      wordId: current.word.id,
      cardId: current.card.id,
      mode,
      phase: reportPhase,
      selectedAnswer: picked,
      uiLang,
      snapshot: {
        word: current.word.word,
        chinese: current.word.chinese,
        imageUrl: current.word.image_url,
        pronunciation: current.word.pronunciation,
        category: current.word.category,
        cardType: current.card.card_type,
        front: current.card.front,
        back: current.card.back,
        explanation: current.card.explanation,
        choices: current.choices ?? [],
        spellingChoices: current.spellingChoices ?? [],
        displayedSpelling: newStep === 3 ? displayedSpelling : null,
      },
    });
    setReportMenuOpen(false);
  }

  return (
    <div className="relative min-h-[calc(100vh-0px)]">
      {/* Top bar: exit + progress + count */}
      <div className="flex items-center gap-4 px-5 py-5 sm:px-8">
        <Link
          href="/today"
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
        <div className="relative flex items-center gap-2">
          <span className="rounded-full bg-white px-3.5 py-1.5 text-sm font-extrabold text-tuji-ink shadow-card">
            {mode === "new"
              ? t("study.stepIndicator", { n: newStep })
              : `${idx + 1} / ${total}`}
          </span>
          <button
            type="button"
            aria-label={t("study.more")}
            aria-expanded={reportMenuOpen}
            onClick={() => setReportMenuOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-xl font-black text-tuji-ink shadow-card"
          >
            ⋯
          </button>
          {reportMenuOpen && (
            <div className="absolute right-0 top-12 z-30 min-w-32 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-black/5">
              <button
                type="button"
                onClick={openReport}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-tuji-coral hover:bg-tuji-bg"
              >
                {t("study.report.menu")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Body: 2-col on lg */}
      <div className="mx-auto grid max-w-5xl items-start gap-6 px-5 pb-10 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        {/* Left — stimulus */}
        <div>
          <div className="mb-4 flex items-end gap-3">
            <Mascot pose={revealed ? "cheer" : "think"} size={72} />
            <div className="relative mb-2 rounded-[20px] bg-white px-5 py-3.5 text-lg font-extrabold tracking-tight text-tuji-ink shadow-card">
              {mode === "new"
                ? newStep === 1
                  ? t("study.newLearn.bubble")
                  : newStep === 2
                  ? t("study.step.bubbleIdentify")
                  : t("study.step.bubbleSpell")
                : revealed
                ? t("study.bubbleReveal")
                : t("study.bubbleAsk")}
            </div>
          </div>

          <div className="relative rounded-[28px] bg-white p-5 shadow-cardHover">
            <WordTile imageUrl={current.word.image_url} word={current.word.word} height={280} rounded={20} fit="contain" />
            {revealed && wasCorrect && (
              <span
                className="absolute right-9 top-9 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-extrabold text-white"
                style={{ background: TUJI.green }}
              >
                ✓ {t("study.correct")}
              </span>
            )}
            <div className="mt-3.5 flex items-center gap-3.5 px-1">
              <PronunciationButton
                text={current.card.back}
                audioUrls={allWords.find((w) => w.id === current.word.id)?.audioUrls}
                size="lg"
              />
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
          {inMcqView && mode === "new" && newStep === 3 ? (
            // Step 3 = spelling judgment. Show ONE candidate and let the user
            // call it correct / misspelled. The 4-option grid below is for
            // Step 2 + review (both use the same "pick the right word" shape).
            (() => {
              const isActuallyCorrect = displayedSpelling === current.card.back;
              const reveal = picked !== null;
              const userPickedYes = picked === "對";
              const userPickedNo = picked === "錯";
              const judgmentRight =
                (userPickedYes && isActuallyCorrect) || (userPickedNo && !isActuallyCorrect);
              return (
                <>
                  <div className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.14em] text-tuji-ink3">
                    {t("study.step.bubbleSpell")}
                  </div>
                  {/* Candidate card */}
                  <div className="mb-3.5 rounded-[20px] bg-white p-5 text-center shadow-card">
                    <div className="font-display text-3xl font-extrabold leading-none tracking-tight text-tuji-ink">
                      {displayedSpelling}
                    </div>
                    {reveal && !isActuallyCorrect && (
                      <div className="mt-3 rounded-xl bg-tuji-bg px-3.5 py-2.5 text-[13px] text-tuji-ink2">
                        {t("study.step.judgeReveal", { correct: current.card.back })}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => pickStepChoice("對")}
                      disabled={reveal}
                      className={`tuji-press flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-4 text-lg font-extrabold disabled:opacity-60 ${
                        reveal && userPickedYes
                          ? judgmentRight
                            ? "ring-4 ring-tuji-green ring-offset-2"
                            : "ring-4 ring-tuji-coral ring-offset-2"
                          : ""
                      }`}
                      style={{
                        background: TUJI.green,
                        color: "#fff",
                        ["--press-shadow" as string]: shade(TUJI.green, -16),
                      }}
                    >
                      ✓ {t("study.step.judgeYes")}
                    </button>
                    <button
                      onClick={() => pickStepChoice("錯")}
                      disabled={reveal}
                      className={`tuji-press flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-4 text-lg font-extrabold disabled:opacity-60 ${
                        reveal && userPickedNo
                          ? judgmentRight
                            ? "ring-4 ring-tuji-green ring-offset-2"
                            : "ring-4 ring-tuji-coral ring-offset-2"
                          : ""
                      }`}
                      style={{
                        background: TUJI.coral,
                        color: "#fff",
                        ["--press-shadow" as string]: shade(TUJI.coral, -16),
                      }}
                    >
                      ✗ {t("study.step.judgeNo")}
                    </button>
                  </div>
                </>
              );
            })()
          ) : inMcqView ? (
            <>
              <div className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.14em] text-tuji-ink3">
                {learningDirection === "zh-ja" ? "選對的日文" : t("study.pickEnglish")}
              </div>
              <div className="flex flex-col gap-3">
                {mcqChoices.map((c, i) => {
                  const tint = CHOICE_TINTS[i % CHOICE_TINTS.length];
                  // After-pick highlighting for new mode Step 2/3: the
                  // correct answer turns green, the wrong pick turns coral,
                  // everything else dims. Mirrors the auto-advance preview
                  // the user gets between cards.
                  const isPicked = picked === c;
                  const isCorrect = current.card.back === c;
                  const showResult = mode === "new" && newStep !== 1 && picked !== null;
                  let bg = tint.bg;
                  let fg = tint.fg;
                  let opacity = 1;
                  if (showResult) {
                    if (isCorrect) {
                      bg = TUJI.green;
                      fg = "#fff";
                    } else if (isPicked) {
                      bg = TUJI.coral;
                      fg = "#fff";
                    } else {
                      opacity = 0.4;
                    }
                  }
                  return (
                    <button
                      key={c}
                      onClick={() =>
                        mode === "new" && newStep !== 1
                          ? pickStepChoice(c)
                          : pickChoice(c)
                      }
                      disabled={submitting || showResult}
                      className="tuji-press flex items-center gap-4 rounded-[20px] px-5 py-4 text-left disabled:opacity-60"
                      style={{ background: bg, opacity, ["--press-shadow" as string]: shade(bg, -10) }}
                    >
                      <span
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white font-mono text-base font-extrabold"
                        style={{ color: fg }}
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1 text-xl font-extrabold tracking-tight" style={{ color: fg }}>
                        {c}
                      </span>
                      <span className="text-lg opacity-55" style={{ color: fg }}>
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

      {/* Running summary — review mirrors the 4 SRS buckets. New mode
          switches per active step: Step 1 shows 認識/知道 counts; Steps 2/3
          show running 對/錯 for the current step so the user can see how
          they're doing without waiting for the done screen. */}
      <div className="flex items-center justify-center gap-3 pb-6 text-xs font-bold text-tuji-ink3">
        <span>{t("study.completed", { done: summary.completed, total })}</span>
        {mode === "new" ? (
          newStep === 1 ? (
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
              <span style={{ color: TUJI.teal }}>
                {t("study.summary.correct")}{" "}
                {newStep === 2 ? summary.step2Correct : summary.step3Correct}
              </span>
              <span className="text-tuji-coral">
                {t("study.summary.wrong")}{" "}
                {newStep === 2 ? summary.step2Wrong : summary.step3Wrong}
              </span>
            </>
          )
        ) : (
          <>
            {summary.重來 > 0 && <span className="text-tuji-coral">{t("study.rate.again")} {summary.重來}</span>}
            {summary.困難 > 0 && <span style={{ color: "#9A6612" }}>{t("study.rate.hard")} {summary.困難}</span>}
            {summary.穩定 > 0 && <span className="text-tuji-teal">{t("study.rate.good")} {summary.穩定}</span>}
            {summary.熟練 > 0 && <span className="text-tuji-green">{t("study.rate.easy")} {summary.熟練}</span>}
          </>
        )}
      </div>

      {peekId && (
        <WordPeekModal
          id={peekId}
          onClose={() => {
            setPeekId(null);
            // Manual "字卡詳情" peek leaves the flag false → close is a
            // pure dismiss. Step 2/3 wrong peek flips it on → close
            // performs the deferred requeue + reseed + advance.
            if (!peekAdvanceOnClose) return;
            setPeekAdvanceOnClose(false);
            setPicked(null);
            const [head, ...rest] = stepQueue;
            const next = [...rest, head];
            setStepQueue(next);
            if (mode === "new" && newStep === 3 && queue && queue[next[0]]) {
              setDisplayedSpelling(pickSpellingForCard(queue[next[0]]));
            }
          }}
        />
      )}
      {reportContext && (
        <StudyReportModal context={reportContext} onClose={() => setReportContext(null)} />
      )}
    </div>
  );
}
