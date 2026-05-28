import Link from "next/link";
import { listAll } from "@/lib/words-db";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

async function loadStats() {
  const words = await listAll();
  const sql = getSql();
  let events7d = 0;
  if (sql) {
    const [{ c }] = (await sql`
      SELECT count(*)::int AS c FROM events WHERE created_at > now() - interval '7 days'
    `) as unknown as { c: number }[];
    events7d = c;
  }
  return { words, events7d };
}

export default async function AdminHome() {
  const { words, events7d } = await loadStats();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-ink">總覽</h1>
      <p className="text-sm text-muted mt-1">後台首頁 — 快速狀態與入口。</p>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <Stat label="總單字數" value={String(words.length)} emoji="📚" />
        <Stat label="7 天事件" value={events7d.toLocaleString()} emoji="📡" />
      </section>

      <section className="mt-8 grid sm:grid-cols-2 gap-4">
        <Link
          href="/admin/words"
          className="rounded-xl2 p-5 bg-white shadow-card hover:shadow-lg transition"
        >
          <div className="text-3xl">📝</div>
          <h2 className="mt-2 font-bold text-ink">單字管理</h2>
          <p className="text-sm text-muted">列表 / 新增 / 修改 / 刪除</p>
        </Link>
        <Link
          href="/admin/stats"
          className="rounded-xl2 p-5 bg-white shadow-card hover:shadow-lg transition"
        >
          <div className="text-3xl">📊</div>
          <h2 className="mt-2 font-bold text-ink">統計儀表板</h2>
          <p className="text-sm text-muted">熱門單字 / 來源</p>
        </Link>
      </section>
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
