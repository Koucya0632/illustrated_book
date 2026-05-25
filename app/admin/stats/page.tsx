import Link from "next/link";
import { getSql } from "@/lib/db";
import { listAll } from "@/lib/words-db";
import CsvButton from "./CsvButton";

export const dynamic = "force-dynamic";

const ALLOWED_DAYS = [7, 14, 30, 90] as const;
const ALLOWED_MIN_ATTEMPTS = [1, 3, 5, 10] as const;
type Days = (typeof ALLOWED_DAYS)[number];
type MinAttempts = (typeof ALLOWED_MIN_ATTEMPTS)[number];

function clampDays(v: unknown): Days {
  const n = Number(v);
  return (ALLOWED_DAYS as readonly number[]).includes(n) ? (n as Days) : 30;
}
function clampMinAttempts(v: unknown): MinAttempts {
  const n = Number(v);
  return (ALLOWED_MIN_ATTEMPTS as readonly number[]).includes(n)
    ? (n as MinAttempts)
    : 3;
}

interface CountRow {
  label: string;
  c: number;
}
interface QuizRow {
  word_id: string | null;
  attempts: number;
  correct: number;
}
interface DayRow {
  d: string;
  c: number;
}

async function loadStats(days: Days, minAttempts: MinAttempts) {
  const sql = getSql();
  if (!sql) {
    return null;
  }
  const words = await listAll();
  const wordMap = new Map(words.map((w) => [w.id, w]));

  // Trend bars get clamped so the chart doesn't become unreadable at 90d.
  const trendDays = Math.min(days, 30);

  const [byType, topViewed, byCategory, quizPerWord, perDay, sessions7d] =
    await Promise.all([
      sql`
        SELECT type AS label, count(*)::int AS c
        FROM events WHERE created_at > now() - make_interval(days => ${days})
        GROUP BY type ORDER BY c DESC
      ` as unknown as Promise<CountRow[]>,
      sql`
        SELECT word_id AS label, count(*)::int AS c
        FROM events
        WHERE type = 'view' AND word_id IS NOT NULL
          AND created_at > now() - make_interval(days => ${days})
        GROUP BY word_id ORDER BY c DESC LIMIT 15
      ` as unknown as Promise<CountRow[]>,
      sql`
        SELECT category AS label, count(*)::int AS c
        FROM events WHERE category IS NOT NULL
          AND created_at > now() - make_interval(days => ${days})
        GROUP BY category ORDER BY c DESC
      ` as unknown as Promise<CountRow[]>,
      sql`
        SELECT word_id, count(*)::int AS attempts,
               sum(CASE WHEN correct THEN 1 ELSE 0 END)::int AS correct
        FROM events
        WHERE type = 'quiz_attempt' AND word_id IS NOT NULL
          AND created_at > now() - make_interval(days => ${days})
        GROUP BY word_id
        HAVING count(*) >= ${minAttempts}
        ORDER BY (sum(CASE WHEN correct THEN 1 ELSE 0 END)::float / count(*)) ASC
        LIMIT 10
      ` as unknown as Promise<QuizRow[]>,
      sql`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS d,
               count(*)::int AS c
        FROM events WHERE created_at > now() - make_interval(days => ${trendDays})
        GROUP BY d ORDER BY d ASC
      ` as unknown as Promise<DayRow[]>,
      sql`
        SELECT count(DISTINCT session_id)::int AS c
        FROM events WHERE created_at > now() - interval '7 days'
          AND session_id IS NOT NULL
      ` as unknown as Promise<{ c: number }[]>,
    ]);

  return {
    byType,
    topViewed,
    byCategory,
    quizPerWord,
    perDay,
    sessions7d: sessions7d[0]?.c ?? 0,
    wordMap,
    trendDays,
  };
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: { days?: string; minAttempts?: string };
}) {
  const days = clampDays(searchParams.days);
  const minAttempts = clampMinAttempts(searchParams.minAttempts);

  const data = await loadStats(days, minAttempts);
  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-rose-600">
          DB 還沒連線。請先確認 <code>DATABASE_URL</code> 已設定。
        </p>
      </div>
    );
  }

  const {
    byType,
    topViewed,
    byCategory,
    quizPerWord,
    perDay,
    sessions7d,
    wordMap,
    trendDays,
  } = data;

  const totalEvents = byType.reduce((s, r) => s + r.c, 0);
  const maxDay = Math.max(1, ...perDay.map((d) => d.c));
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold text-ink">統計儀表板</h1>
        <p className="text-sm text-muted mt-1">
          過去 {days} 天的全站行為摘要。
        </p>
      </header>

      <section className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <Segmented
          label="區間"
          options={ALLOWED_DAYS.map((d) => ({ value: d, label: `${d}d` }))}
          current={days}
          paramKey="days"
          otherParams={{ minAttempts: String(minAttempts) }}
        />
        <Segmented
          label="最少嘗試"
          options={ALLOWED_MIN_ATTEMPTS.map((n) => ({ value: n, label: `≥${n}` }))}
          current={minAttempts}
          paramKey="minAttempts"
          otherParams={{ days: String(days) }}
        />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Stat label={`總事件 (${days}d)`} value={totalEvents.toLocaleString()} emoji="📡" />
        <Stat
          label="不同訪客 (7d)"
          value={sessions7d.toLocaleString()}
          emoji="👥"
        />
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <Card
          title={`事件類型分佈 (${days}d)`}
          action={
            <CsvButton
              filename={`event-types-${days}d-${today}.csv`}
              headers={["type", "count"]}
              rows={byType.map((r) => [r.label, r.c])}
            />
          }
        >
          <ul className="space-y-2">
            {byType.length === 0 && <Empty />}
            {byType.map((r) => (
              <Bar
                key={r.label}
                label={r.label}
                value={r.c}
                max={Math.max(1, ...byType.map((x) => x.c))}
              />
            ))}
          </ul>
        </Card>

        <Card title={`${trendDays} 天每日事件趨勢`}>
          <ul className="space-y-2">
            {perDay.length === 0 && <Empty />}
            {perDay.map((r) => (
              <Bar key={r.d} label={r.d} value={r.c} max={maxDay} />
            ))}
          </ul>
        </Card>
      </section>

      <section>
        <Card
          title={`瀏覽最多的單字 (Top 15, ${days}d)`}
          action={
            <CsvButton
              filename={`top-viewed-${days}d-${today}.csv`}
              headers={["rank", "word_id", "word", "chinese", "views"]}
              rows={topViewed.map((r, i) => {
                const w = r.label ? wordMap.get(r.label) : undefined;
                return [i + 1, r.label, w?.word ?? "", w?.chinese ?? "", r.c];
              })}
            />
          }
        >
          {topViewed.length === 0 ? (
            <Empty />
          ) : (
            <ol className="space-y-1.5">
              {topViewed.map((r, i) => {
                const w = r.label ? wordMap.get(r.label) : undefined;
                return (
                  <li
                    key={r.label}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-muted w-6 text-right">{i + 1}.</span>
                      {w ? (
                        <Link
                          href={`/word/${w.id}`}
                          className="font-medium text-ink hover:underline truncate"
                        >
                          {w.word}
                          <span className="text-muted ml-1">· {w.chinese}</span>
                        </Link>
                      ) : (
                        <span className="text-muted truncate">{r.label}</span>
                      )}
                    </span>
                    <span className="font-semibold text-ink">{r.c}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <Card
          title={`各分類熱度 (${days}d)`}
          action={
            <CsvButton
              filename={`categories-${days}d-${today}.csv`}
              headers={["category", "count"]}
              rows={byCategory.map((r) => [r.label, r.c])}
            />
          }
        >
          <ul className="space-y-2">
            {byCategory.length === 0 && <Empty />}
            {byCategory.map((r) => (
              <Bar
                key={r.label}
                label={r.label}
                value={r.c}
                max={Math.max(1, ...byCategory.map((x) => x.c))}
              />
            ))}
          </ul>
        </Card>

        <Card
          title={`測驗最難的單字 (≥${minAttempts} 次嘗試, 正確率低)`}
          action={
            <CsvButton
              filename={`quiz-hardest-${days}d-min${minAttempts}-${today}.csv`}
              headers={["word_id", "word", "chinese", "attempts", "correct", "rate_pct"]}
              rows={quizPerWord.map((r) => {
                const w = r.word_id ? wordMap.get(r.word_id) : undefined;
                const rate = r.attempts > 0
                  ? Math.round((r.correct / r.attempts) * 100)
                  : 0;
                return [
                  r.word_id ?? "",
                  w?.word ?? "",
                  w?.chinese ?? "",
                  r.attempts,
                  r.correct,
                  rate,
                ];
              })}
            />
          }
        >
          {quizPerWord.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {quizPerWord.map((r) => {
                const w = r.word_id ? wordMap.get(r.word_id) : undefined;
                const rate = r.attempts > 0
                  ? Math.round((r.correct / r.attempts) * 100)
                  : 0;
                return (
                  <li
                    key={r.word_id ?? ""}
                    className="flex items-center justify-between gap-3"
                  >
                    {w ? (
                      <Link
                        href={`/word/${w.id}`}
                        className="font-medium text-ink hover:underline truncate"
                      >
                        {w.word}
                        <span className="text-muted ml-1">· {w.chinese}</span>
                      </Link>
                    ) : (
                      <span className="text-muted">{r.word_id}</span>
                    )}
                    <span className="text-xs text-muted shrink-0">
                      {r.correct}/{r.attempts}{" "}
                      <span
                        className={
                          rate < 50 ? "text-rose-500 font-semibold" : "text-ink"
                        }
                      >
                        ({rate}%)
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function Segmented<T extends number>({
  label,
  options,
  current,
  paramKey,
  otherParams,
}: {
  label: string;
  options: { value: T; label: string }[];
  current: T;
  paramKey: string;
  otherParams: Record<string, string>;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">{label}</span>
      <div className="inline-flex bg-white rounded-full shadow-soft p-1">
        {options.map((o) => {
          const params = new URLSearchParams({
            ...otherParams,
            [paramKey]: String(o.value),
          });
          const active = o.value === current;
          return (
            <Link
              key={o.value}
              href={`/admin/stats?${params.toString()}`}
              className={
                active
                  ? "px-3 py-1 rounded-full bg-sky-accent text-white text-xs font-medium"
                  : "px-3 py-1 rounded-full text-xs text-muted hover:text-ink"
              }
            >
              {o.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="rounded-xl2 bg-white shadow-card p-4">
      <span className="text-2xl">{emoji}</span>
      <p className="mt-2 text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink">{value}</p>
    </div>
  );
}

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl2 shadow-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <li>
      <div className="flex items-baseline justify-between text-xs mb-0.5">
        <span className="text-ink font-medium truncate">{label}</span>
        <span className="text-muted ml-2">{value}</span>
      </div>
      <div className="h-2 bg-cream rounded-full overflow-hidden">
        <div className="h-full bg-sky-accent" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

function Empty() {
  return <p className="text-sm text-muted">尚無資料。</p>;
}
