import Link from "next/link";
import { getAtlasFunnel } from "@/lib/atlas-db";

export const dynamic = "force-dynamic";

const WINDOWS = [7, 30, 90];

function pct(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export default async function AdminAtlasFunnelPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const days = Number(searchParams.days ?? 30);
  const report = await getAtlasFunnel(Number.isFinite(days) ? days : 30);
  const { funnel, ai } = report;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">圖鑑數據</h1>
          <p className="mt-1 text-sm text-muted">最近 {report.days} 天的拍照漏斗與 AI 成本。</p>
        </div>
        <div className="flex gap-2">
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={`/admin/atlas/funnel?days=${w}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                report.days === w ? "bg-ink text-white" : "text-muted hover:bg-black/5"
              }`}
            >
              {w} 天
            </Link>
          ))}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="上傳" value={funnel.uploads} />
        <Stat label="辨識成功" value={funnel.recognized} sub={pct(funnel.recognized, funnel.uploads)} />
        <Stat label="已確認" value={funnel.confirmed} sub={pct(funnel.confirmed, funnel.uploads)} />
        <Stat label="生成卡片" value={funnel.carded} sub={pct(funnel.carded, funnel.confirmed)} />
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="AI 呼叫" value={ai.calls} />
        <Stat label="成功率" value={`${(ai.successRate * 100).toFixed(1)}%`} />
        <Stat label="總成本" value={`$${ai.totalCostUsd.toFixed(4)}`} />
        <Stat
          label="平均延遲"
          value={ai.avgLatencyMs == null ? "—" : `${Math.round(ai.avgLatencyMs)} ms`}
        />
      </section>

      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <h2 className="text-lg font-bold text-ink">依操作</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1">operation</th>
              <th className="py-1">呼叫</th>
              <th className="py-1">成功率</th>
              <th className="py-1">成本</th>
            </tr>
          </thead>
          <tbody>
            {ai.byOperation.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-muted">
                  這段期間沒有 AI 呼叫。
                </td>
              </tr>
            )}
            {ai.byOperation.map((op) => (
              <tr key={op.operation} className="border-t border-black/5">
                <td className="py-1.5 font-medium text-ink">{op.operation}</td>
                <td className="py-1.5">{op.calls}</td>
                <td className="py-1.5">{(op.successRate * 100).toFixed(1)}%</td>
                <td className="py-1.5">${op.costUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <h2 className="text-lg font-bold text-ink">AI 成本前 10 名使用者</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1">user_id</th>
              <th className="py-1">呼叫</th>
              <th className="py-1">成本</th>
            </tr>
          </thead>
          <tbody>
            {report.topUsersByCost.length === 0 && (
              <tr>
                <td colSpan={3} className="py-3 text-muted">
                  沒有資料。
                </td>
              </tr>
            )}
            {report.topUsersByCost.map((u) => (
              <tr key={u.userId} className="border-t border-black/5">
                <td className="break-all py-1.5 font-mono text-xs text-ink">{u.userId}</td>
                <td className="py-1.5">{u.calls}</td>
                <td className="py-1.5">${u.costUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Link href="/admin/atlas" className="inline-block text-sm font-semibold text-sky-accent hover:underline">
        返回圖鑑審核
      </Link>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl2 bg-white p-4 shadow-card">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
