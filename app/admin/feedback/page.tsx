import Link from "next/link";
import { getSql } from "@/lib/db";
import FeedbackActions from "./FeedbackActions";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  feature: "功能建議",
  bug: "問題回報",
  content: "內容建議",
  other: "其他",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "待處理",
  reviewing: "確認中",
  resolved: "已處理",
  rejected: "不採納",
  duplicate: "重複意見",
};

interface FeedbackRow {
  id: number;
  feedback_type: string;
  description: string;
  platform: string;
  app_version: string | null;
  ui_lang: string;
  status: string;
  internal_note: string | null;
  created_at: string;
  updated_at: string;
  username: string | null;
}

function allowed(value: unknown, values: string[]): string {
  return typeof value === "string" && values.includes(value) ? value : "";
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: { status?: string; type?: string; platform?: string; days?: string };
}) {
  const status = allowed(searchParams.status, Object.keys(STATUS_LABELS));
  const feedbackType = allowed(searchParams.type, Object.keys(TYPE_LABELS));
  const platform = allowed(searchParams.platform, ["web", "ios"]);
  const days = allowed(searchParams.days, ["7", "30", "90"]);
  const sql = getSql();

  if (!sql) {
    return <main className="mx-auto max-w-6xl px-4 py-8 text-rose-600">DB 尚未連線。</main>;
  }

  const rows = await sql`
    SELECT f.*, p.username
    FROM feedback f
    LEFT JOIN profiles p ON p.id = f.user_id
    WHERE (${status} = '' OR f.status = ${status})
      AND (${feedbackType} = '' OR f.feedback_type = ${feedbackType})
      AND (${platform} = '' OR f.platform = ${platform})
      AND (${days} = '' OR f.created_at > now() - (${days || "0"} || ' days')::interval)
    ORDER BY
      CASE f.status WHEN 'pending' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,
      f.created_at DESC
    LIMIT 200
  ` as unknown as FeedbackRow[];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">意見收集</h1>
        <p className="mt-1 text-sm text-muted">共顯示 {rows.length} 筆；待處理意見優先。</p>
      </header>

      <form className="grid gap-3 rounded-xl2 bg-white p-4 shadow-card sm:grid-cols-4">
        <Filter name="status" label="狀態" value={status} options={STATUS_LABELS} />
        <Filter name="type" label="意見類型" value={feedbackType} options={TYPE_LABELS} />
        <Filter name="platform" label="平台" value={platform} options={{ web: "網頁", ios: "iOS" }} />
        <Filter name="days" label="日期" value={days} options={{ "7": "近 7 天", "30": "近 30 天", "90": "近 90 天" }} />
        <div className="flex gap-2 sm:col-span-4">
          <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">套用篩選</button>
          <Link href="/admin/feedback" className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-black/5">清除</Link>
        </div>
      </form>

      <section className="space-y-4">
        {rows.length === 0 && <div className="rounded-xl2 bg-white p-8 text-center text-muted shadow-card">沒有符合條件的意見。</div>}
        {rows.map((feedback) => (
          <article id={`feedback-${feedback.id}`} key={feedback.id} className="scroll-mt-20 rounded-xl2 bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-ink">#{feedback.id}</span>
                  <span className="rounded-full bg-sky-soft px-2.5 py-1 text-xs font-bold text-sky-accent">
                    {STATUS_LABELS[feedback.status]}
                  </span>
                  <span className="text-sm font-semibold text-ink">{TYPE_LABELS[feedback.feedback_type]}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{feedback.description}</p>
              </div>
              <time className="text-xs text-muted">{new Date(feedback.created_at).toLocaleString("zh-TW")}</time>
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-lg bg-cream/60 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Meta label="使用者" value={feedback.username ?? "已刪除帳號"} />
              <Meta label="環境" value={`${feedback.platform} · ${feedback.app_version ?? "unknown"} · ${feedback.ui_lang}`} />
              <Meta label="最後更新" value={new Date(feedback.updated_at).toLocaleString("zh-TW")} />
            </dl>

            <FeedbackActions
              id={feedback.id}
              initialStatus={feedback.status}
              initialNote={feedback.internal_note}
            />
          </article>
        ))}
      </section>
    </main>
  );
}

function Filter({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: Record<string, string>;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      <select name={name} defaultValue={value} className="w-full rounded-lg border border-black/10 bg-white px-3 py-2">
        <option value="">全部</option>
        {Object.entries(options).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
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
