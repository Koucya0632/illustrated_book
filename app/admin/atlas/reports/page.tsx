import Link from "next/link";
import { listAtlasReports, type AtlasReportStatus } from "@/lib/atlas-db";
import AtlasReportActions from "./AtlasReportActions";

export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  spam: "垃圾／廣告",
  inappropriate: "不當內容",
  copyright: "侵權",
  wrong: "資訊錯誤",
  other: "其他",
};

const STATUS_LABELS: Record<string, string> = {
  open: "待處理",
  reviewed: "已處理",
  dismissed: "已忽略",
};

function allowedStatus(value: unknown): AtlasReportStatus | "" {
  return value === "open" || value === "reviewed" || value === "dismissed" ? value : "";
}

export default async function AdminAtlasReportsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = allowedStatus(searchParams.status ?? "open");
  const reports = await listAtlasReports(status, 200);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">公開圖鑑檢舉</h1>
          <p className="mt-1 text-sm text-muted">
            共 {reports.length} 筆。下架內容請到{" "}
            <Link href="/admin/atlas" className="font-semibold text-sky-accent hover:underline">
              圖鑑審核
            </Link>{" "}
            用 Item ID 操作。
          </p>
        </div>
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-xl2 bg-white p-4 shadow-card">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink">狀態</span>
          <select
            name="status"
            defaultValue={status}
            className="w-48 rounded-lg border border-black/10 bg-white px-3 py-2"
          >
            <option value="">全部</option>
            <option value="open">待處理</option>
            <option value="reviewed">已處理</option>
            <option value="dismissed">已忽略</option>
          </select>
        </label>
        <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">套用篩選</button>
        <Link href="/admin/atlas/reports" className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-black/5">
          清除
        </Link>
      </form>

      <section className="space-y-4">
        {reports.length === 0 && (
          <div className="rounded-xl2 bg-white p-8 text-center text-muted shadow-card">沒有符合條件的檢舉。</div>
        )}
        {reports.map((r) => (
          <article key={r.id} className="rounded-xl2 bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-tuji-coral/15 px-2.5 py-1 text-xs font-bold text-tuji-coral">
                {REASON_LABELS[r.reason] ?? r.reason}
              </span>
              <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-ink">
                {STATUS_LABELS[r.status] ?? r.status}
              </span>
              {r.public_review_status === "takedown" && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  已下架
                </span>
              )}
            </div>
            <h2 className="mt-3 text-lg font-bold text-ink">
              {r.lemma ?? "（內容已移除）"}
              {r.display_zh_hant && <span className="ml-2 text-base font-medium text-muted">{r.display_zh_hant}</span>}
            </h2>
            {r.detail && <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{r.detail}</p>}
            <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-lg bg-cream/60 p-4 text-sm sm:grid-cols-2">
              <Meta label="Item ID（下架用）" value={r.source_item_id ?? "—"} />
              <Meta label="公開 slug" value={r.slug} />
              <Meta label="檢舉者" value={r.reporter_user_id} />
              <Meta label="時間" value={new Date(r.created_at).toLocaleString("zh-TW")} />
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link
                href={`/atlas/public/${r.slug}`}
                className="text-sm font-semibold text-sky-accent hover:underline"
              >
                查看公開頁
              </Link>
              {r.status === "open" && <AtlasReportActions id={r.id} />}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="break-all font-medium text-ink">{value}</dd>
    </div>
  );
}
