import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { creditOperationsReport } from "@/lib/credits/operations-report";

export const dynamic = "force-dynamic";
export default async function CreditsOperationsPage() {
  if (!await verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value)) redirect("/admin/login");
  const sql = getSql();
  let report;
  try { if (sql) report = await creditOperationsReport(sql, new Date(), Number(process.env.AI_CREDITS_DAILY_COST_ALERT_USD ?? 10)); }
  catch { /* Show unavailable instead of incorrectly reporting zero. */ }
  return <main className="max-w-5xl mx-auto p-6 space-y-6">
    <header><h1 className="text-2xl font-semibold">罐頭點數營運</h1><p className="text-muted mt-2">更新頁面即可取得最新狀態。此頁只讀取資料。</p></header>
    {!report ? <p role="alert">目前無法取得營運資料，請稍後重試。</p> : <>
      <p className="text-sm text-muted">最近 24 小時 · {report.generatedAt} · 成本提示門檻 US${report.dailyBudgetUsd}</p>
      {report.environments.map(row => <section key={row.environment} className="rounded-xl bg-white border p-5 space-y-3">
        <h2 className="text-lg font-semibold">{row.environment === "production" ? "正式環境" : "沙盒環境"} · {row.alert ? "需要檢查" : "未觸發積壓或成本提示"}</h2>
        {row.alert && <p role="alert" className="text-red-700">請檢查延遲工作、Apple 通知及成本；必要時暫停接受新 AI 工作。</p>}
        <dl className="grid sm:grid-cols-2 gap-3">
          <div><dt>待處理辨識／延遲超過 5 分鐘</dt><dd>{row.operations_pending}／{row.operations_delayed}</dd></div>
          <div><dt>待處理補充／延遲超過 5 分鐘</dt><dd>{row.fulfillments_pending}／{row.fulfillments_delayed}</dd></div>
          <div><dt>待處理 Apple 通知／延遲或重試 3 次</dt><dd>{row.notifications_pending}／{row.notifications_delayed}</dd></div>
          <div><dt>等待人工退款處理的帳號</dt><dd>{row.refund_review_accounts}</dd></div>
          <div><dt>AI 呼叫次數／缺少成本估算</dt><dd>{row.attempts_24h}／{row.attempts_without_cost}</dd></div>
          <div><dt>已知 AI 成本估算</dt><dd>US${Number(row.estimated_cost_usd).toFixed(6)}</dd></div>
        </dl>
      </section>)}
      <p className="text-sm text-muted">成本包含已有估算的呼叫與重試。缺少估算的呼叫未計入，實際帳單以供應商為準。此處提示不會寄送通知。</p>
    </>}
    <Link href="/admin/members" className="text-sky-accent">前往會員詳情處理退款</Link>
  </main>;
}
