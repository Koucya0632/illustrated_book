import Link from "next/link";
import { getSql } from "@/lib/db";
import ReportActions from "./ReportActions";

export const dynamic = "force-dynamic";

const ISSUE_LABELS: Record<string, string> = {
  image: "圖片不正確或不清楚",
  content: "單字、翻譯或解釋有誤",
  audio: "發音或音訊有問題",
  answer: "題目或答案有誤",
  ui: "頁面顯示或操作異常",
  other: "其他問題",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "待處理",
  reviewing: "確認中",
  resolved: "已修正",
  rejected: "無需修正",
  duplicate: "重複報錯",
};

interface ReportRow {
  id: number;
  word_id: string | null;
  card_id: number | null;
  issue_type: string;
  description: string;
  mode: string;
  phase: string;
  selected_answer: string | null;
  platform: string;
  app_version: string | null;
  ui_lang: string;
  snapshot: Record<string, unknown>;
  status: string;
  internal_note: string | null;
  duplicate_of: number | null;
  created_at: string;
  updated_at: string;
  username: string | null;
  similar_open: number;
  similar_reports: { id: number; status: string }[];
}

function allowed(value: unknown, values: string[]): string {
  return typeof value === "string" && values.includes(value) ? value : "";
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { status?: string; type?: string; platform?: string; days?: string };
}) {
  const status = allowed(searchParams.status, Object.keys(STATUS_LABELS));
  const issueType = allowed(searchParams.type, Object.keys(ISSUE_LABELS));
  const platform = allowed(searchParams.platform, ["web", "ios"]);
  const days = allowed(searchParams.days, ["7", "30", "90"]);
  const sql = getSql();

  if (!sql) {
    return <main className="mx-auto max-w-6xl px-4 py-8 text-rose-600">DB 尚未連線。</main>;
  }

  const rows = await sql`
    SELECT r.*,
           p.username,
           (
             SELECT count(*)::int
             FROM study_reports s
             WHERE s.id <> r.id
               AND s.word_id = r.word_id
               AND s.issue_type = r.issue_type
               AND s.status IN ('pending', 'reviewing')
           ) AS similar_open
           ,
           (
             SELECT coalesce(
               jsonb_agg(
                 jsonb_build_object('id', x.id, 'status', x.status)
                 ORDER BY x.created_at DESC
               ),
               '[]'::jsonb
             )
             FROM (
               SELECT s.id, s.status, s.created_at
               FROM study_reports s
               WHERE s.id <> r.id AND s.word_id = r.word_id
               ORDER BY s.created_at DESC
               LIMIT 10
             ) x
           ) AS similar_reports
    FROM study_reports r
    LEFT JOIN profiles p ON p.id = r.user_id
    WHERE (${status} = '' OR r.status = ${status})
      AND (${issueType} = '' OR r.issue_type = ${issueType})
      AND (${platform} = '' OR r.platform = ${platform})
      AND (${days} = '' OR r.created_at > now() - (${days || "0"} || ' days')::interval)
    ORDER BY
      CASE r.status WHEN 'pending' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,
      r.created_at DESC
    LIMIT 200
  ` as unknown as ReportRow[];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">報錯中心</h1>
        <p className="mt-1 text-sm text-muted">共顯示 {rows.length} 筆；待處理案件優先。</p>
      </header>

      <form className="grid gap-3 rounded-xl2 bg-white p-4 shadow-card sm:grid-cols-4">
        <Filter name="status" label="狀態" value={status} options={STATUS_LABELS} />
        <Filter name="type" label="問題類型" value={issueType} options={ISSUE_LABELS} />
        <Filter name="platform" label="平台" value={platform} options={{ web: "網頁", ios: "iOS" }} />
        <Filter name="days" label="日期" value={days} options={{ "7": "近 7 天", "30": "近 30 天", "90": "近 90 天" }} />
        <div className="flex gap-2 sm:col-span-4">
          <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">套用篩選</button>
          <Link href="/admin/reports" className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-black/5">清除</Link>
        </div>
      </form>

      <section className="space-y-4">
        {rows.length === 0 && <div className="rounded-xl2 bg-white p-8 text-center text-muted shadow-card">沒有符合條件的報錯。</div>}
        {rows.map((report) => (
          <article id={`report-${report.id}`} key={report.id} className="scroll-mt-20 rounded-xl2 bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-ink">#{report.id}</span>
                  <span className="rounded-full bg-sky-soft px-2.5 py-1 text-xs font-bold text-sky-accent">
                    {STATUS_LABELS[report.status]}
                  </span>
                  <span className="text-sm font-semibold text-ink">{ISSUE_LABELS[report.issue_type]}</span>
                  {report.similar_open > 0 && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      同字同類另有 {report.similar_open} 筆未結
                    </span>
                  )}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{report.description}</p>
              </div>
              <time className="text-xs text-muted">{new Date(report.created_at).toLocaleString("zh-TW")}</time>
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-lg bg-cream/60 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Meta label="單字" value={String(report.snapshot?.word ?? report.word_id ?? "—")} />
              <Meta label="Word ID" value={report.word_id ?? "—"} />
              <Meta label="Card ID" value={report.card_id?.toString() ?? "—"} />
              <Meta label="學習位置" value={`${report.mode} · ${report.phase}`} />
              <Meta label="所選答案" value={report.selected_answer ?? "—"} />
              <Meta label="環境" value={`${report.platform} · ${report.app_version ?? "unknown"} · ${report.ui_lang}`} />
              <Meta label="使用者" value={report.username ?? "已刪除帳號"} />
              {report.duplicate_of && <Meta label="主要案件" value={`#${report.duplicate_of}`} />}
            </dl>

            {report.similar_reports.length > 0 && (
              <div className="mt-3 text-sm text-muted">
                同一單字其他報錯：
                {report.similar_reports.map((item, index) => (
                  <span key={item.id}>
                    {index > 0 ? "、" : " "}
                    <a href={`#report-${item.id}`} className="font-semibold text-sky-accent hover:underline">
                      #{item.id} {STATUS_LABELS[item.status] ?? item.status}
                    </a>
                  </span>
                ))}
              </div>
            )}

            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-medium text-sky-accent">查看題目快照</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                {JSON.stringify(report.snapshot, null, 2)}
              </pre>
            </details>

            {report.word_id && (
              <Link
                href={`/admin/words/${encodeURIComponent(report.word_id)}/edit`}
                className="mt-3 inline-block text-sm font-semibold text-sky-accent hover:underline"
              >
                前往單字編輯頁 →
              </Link>
            )}

            <ReportActions
              id={report.id}
              initialStatus={report.status}
              initialNote={report.internal_note}
              initialDuplicateOf={report.duplicate_of}
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
