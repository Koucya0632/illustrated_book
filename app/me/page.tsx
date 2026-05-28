import Link from "next/link";
import { redirect } from "next/navigation";
import MasteryBar from "@/components/MasteryBar";
import { getCurrentUserBundle } from "@/lib/current-user";
import { getAllWords } from "@/lib/data";
import { applyDecay, masteryLevel } from "@/lib/mastery";
import { getAllMastery, getQuizHistory, getStudyStreak, type StudyStreak } from "@/lib/users-db";
import MeClient from "./MeClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "我的帳號" };

export default async function MePage() {
  const bundle = await getCurrentUserBundle();
  if (!bundle) redirect("/signin?next=/me");

  const [allWords, quizHistory, masteryRows, streak] = await Promise.all([
    getAllWords(),
    getQuizHistory(bundle.user.id, 10),
    getAllMastery(bundle.user.id),
    getStudyStreak(bundle.user.id),
  ]);
  const byId = new Map(allWords.map((w) => [w.id, w]));
  const fav = bundle.favorites.map((id) => byId.get(id)).filter(Boolean);
  const learnedCount = bundle.learned.length;
  const totalAttempts = quizHistory.reduce((s, q) => s + q.total, 0);
  const totalCorrect = quizHistory.reduce((s, q) => s + q.correct, 0);
  const rate = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  // Apply forgetting-curve decay to each row, then rank.
  const now = new Date();
  const masteredItems = masteryRows
    .map((r) => {
      const current = applyDecay(
        r.mastery,
        r.last_reviewed_at ? new Date(r.last_reviewed_at) : null,
        now,
      );
      const w = byId.get(r.word_id);
      return w ? { word: w, mastery: current } : null;
    })
    .filter(Boolean) as { word: NonNullable<ReturnType<typeof byId.get>>; mastery: number }[];
  masteredItems.sort((a, b) => b.mastery - a.mastery);
  const avgMastery =
    masteredItems.length > 0
      ? masteredItems.reduce((s, x) => s + x.mastery, 0) / masteredItems.length
      : 0;
  const topMastered = masteredItems.slice(0, 5);
  const needsWork = [...masteredItems]
    .filter((x) => x.mastery < 60)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 5);
  const masteredCount = masteredItems.filter((x) => x.mastery >= 80).length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink">
            👋 你好，{bundle.user.username}
          </h1>
          <p className="text-sm text-muted mt-1">
            {bundle.user.email} · 自{" "}
            {new Date(bundle.user.createdAt).toLocaleDateString("zh-TW")} 加入
          </p>
        </div>
        <MeClient />
      </header>

      <StreakBanner streak={streak} />

      <section className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="收藏" value={String(bundle.favorites.length)} emoji="❤️" />
        <Stat label="已學單字" value={`${learnedCount}/${allWords.length}`} emoji="📚" />
        <Stat
          label="平均熟練度"
          value={
            masteredItems.length > 0
              ? `${Math.round(avgMastery)}/100`
              : "—"
          }
          emoji="🧠"
        />
        <Stat label="已熟練 (≥80)" value={String(masteredCount)} emoji="🌟" />
      </section>

      <section className="mt-3 grid grid-cols-2 sm:grid-cols-2 gap-3">
        <Stat label="測驗次數" value={String(quizHistory.length)} emoji="🎯" />
        <Stat label="總正確率" value={`${rate}%`} emoji="📈" />
      </section>

      {masteredItems.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-bold text-ink">熟練度概覽</h2>
          <p className="text-xs text-muted mt-0.5">
            熟練度會隨時間自然衰減 — 久沒複習的字分數會慢慢下降。
          </p>
          <div className="mt-3 grid sm:grid-cols-2 gap-4">
            {topMastered.length > 0 && (
              <div className="bg-white rounded-xl2 shadow-card p-4">
                <h3 className="text-sm font-semibold text-ink">🌟 最熟的字</h3>
                <ul className="mt-3 space-y-3">
                  {topMastered.map((item) => (
                    <MasteryRow key={item.word.id} word={item.word} mastery={item.mastery} />
                  ))}
                </ul>
              </div>
            )}
            {needsWork.length > 0 && (
              <div className="bg-white rounded-xl2 shadow-card p-4">
                <h3 className="text-sm font-semibold text-ink">⚠️ 需要加強</h3>
                <ul className="mt-3 space-y-3">
                  {needsWork.map((item) => (
                    <MasteryRow key={item.word.id} word={item.word} mastery={item.mastery} />
                  ))}
                </ul>
                <Link
                  href="/study"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-sky-accent hover:underline"
                >
                  去複習 →
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-bold text-ink">我的收藏</h2>
        {fav.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            還沒有收藏單字。{" "}
            <Link href="/" className="text-sky-accent hover:underline">
              去逛圖鑑 →
            </Link>
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {fav.map((w) => (
              <Link
                key={w!.id}
                href={`/word/${w!.id}`}
                className="bg-white rounded-xl shadow-soft hover:shadow-card transition px-3 py-3 flex items-center gap-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={w!.imageUrl}
                  alt={w!.word}
                  className="w-12 h-12 rounded-lg object-cover bg-cream"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-ink truncate">{w!.word}</p>
                  <p className="text-xs text-muted truncate">{w!.chinese}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold text-ink">最近測驗</h2>
        {quizHistory.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            還沒有測驗紀錄。{" "}
            <Link href="/quiz" className="text-sky-accent hover:underline">
              做一個測驗 →
            </Link>
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {quizHistory.map((q) => {
              const r = q.total > 0 ? Math.round((q.correct / q.total) * 100) : 0;
              return (
                <li
                  key={q.id}
                  className="bg-white rounded-xl shadow-soft px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold text-ink">{TYPE_LABEL[q.quiz_type] ?? q.quiz_type}</p>
                    <p className="text-xs text-muted">
                      {new Date(q.created_at).toLocaleString("zh-TW")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-ink">
                      {q.correct}/{q.total}
                    </p>
                    <p className="text-xs text-muted">{r}%</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  image: "看圖選英文",
  chinese: "看中文選英文",
  spelling: "拼字練習",
};

function StreakBanner({ streak }: { streak: StudyStreak }) {
  const { current, longest, totalDays, todayCount } = streak;

  // Three states: studied today / streak alive but not done today / no streak.
  let headline: string;
  let sub: string;
  if (todayCount > 0) {
    headline = `🔥 連續 ${current} 天`;
    sub = `今天已複習 ${todayCount} 張，做得好！`;
  } else if (current > 0) {
    headline = `🔥 連續 ${current} 天`;
    sub = "今天還沒複習 — 把握住，別中斷連續紀錄！";
  } else {
    headline = "🔥 開始你的學習連續紀錄";
    sub = totalDays > 0 ? "連續紀錄中斷了，今天重新開始吧。" : "完成第一次複習就開始計算。";
  }

  return (
    <section className="mt-6 rounded-xl2 bg-gradient-to-br from-amber-50 to-orange-100/60 shadow-card p-5 flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-2xl sm:text-3xl font-bold text-ink">{headline}</p>
        <p className="text-sm text-muted mt-1">{sub}</p>
        {totalDays > 0 && (
          <p className="text-xs text-muted mt-2">
            最長 {longest} 天 · 累計學習 {totalDays} 天
          </p>
        )}
      </div>
      {(current === 0 || todayCount === 0) && (
        <Link
          href="/study"
          className="shrink-0 px-5 py-3 rounded-full bg-sky-accent text-white font-medium shadow-card hover:bg-sky-accent/90"
        >
          去複習
        </Link>
      )}
    </section>
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

function MasteryRow({
  word,
  mastery,
}: {
  word: { id: string; word: string; chinese: string; imageUrl: string };
  mastery: number;
}) {
  return (
    <li>
      <Link href={`/word/${word.id}`} className="flex items-center gap-3 group">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={word.imageUrl} alt={word.word} className="w-10 h-10 rounded-lg object-cover bg-cream shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink truncate group-hover:underline">
            {word.word} <span className="text-muted font-normal">· {word.chinese}</span>
          </p>
          <MasteryBar score={mastery} size="sm" showLabel={false} />
        </div>
        <span className="text-xs font-mono text-muted shrink-0 tabular-nums">
          {Math.round(mastery)}
        </span>
      </Link>
    </li>
  );
}
