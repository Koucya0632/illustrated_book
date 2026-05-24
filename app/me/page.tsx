import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserBundle } from "@/lib/current-user";
import { getAllWords } from "@/lib/data";
import { getQuizHistory } from "@/lib/users-db";
import MeClient from "./MeClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "我的帳號" };

export default async function MePage() {
  const bundle = await getCurrentUserBundle();
  if (!bundle) redirect("/signin?next=/me");

  const [allWords, quizHistory] = await Promise.all([
    getAllWords(),
    getQuizHistory(bundle.user.id, 10),
  ]);
  const byId = new Map(allWords.map((w) => [w.id, w]));
  const fav = bundle.favorites.map((id) => byId.get(id)).filter(Boolean);
  const learnedCount = bundle.learned.length;
  const totalAttempts = quizHistory.reduce((s, q) => s + q.total, 0);
  const totalCorrect = quizHistory.reduce((s, q) => s + q.correct, 0);
  const rate = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

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

      <section className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="收藏" value={String(bundle.favorites.length)} emoji="❤️" />
        <Stat label="已學單字" value={`${learnedCount}/${allWords.length}`} emoji="📚" />
        <Stat label="測驗次數" value={String(quizHistory.length)} emoji="🎯" />
        <Stat label="總正確率" value={`${rate}%`} emoji="📈" />
      </section>

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

function Stat({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="rounded-xl2 bg-white shadow-card p-4">
      <span className="text-2xl">{emoji}</span>
      <p className="mt-2 text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink">{value}</p>
    </div>
  );
}
