import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { creditOperationsReport } from "@/lib/credits/operations-report";
import { realisedMarkupReport } from "@/lib/credits/markup-report";

const FEATURE_NAMES: Record<string, string> = {
  capture: "拍照做卡", story: "情境故事", chat: "主題對話", vocabulary: "AI 查詞", grammar: "AI 語法", ask: "問 AI（已退役）",
};

export const dynamic = "force-dynamic";
export default async function CreditsOperationsPage() {
  if (!await verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value)) redirect("/admin/login");
  const sql = getSql();
  let report;
  try { if (sql) report = await creditOperationsReport(sql, new Date(), Number(process.env.AI_CREDITS_DAILY_COST_ALERT_USD ?? 10)); }
  catch { /* Show unavailable instead of incorrectly reporting zero. */ }
  let markup;
  try { if (sql) markup = await realisedMarkupReport(sql); }
  catch { /* Same: unavailable, never zero. */ }
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
    <section className="rounded-xl bg-white border p-5 space-y-3">
      <h2 className="text-lg font-semibold">實際倍率</h2>
      {!markup ? <p role="alert">目前無法取得用量紀錄，請稍後重試。</p> : <>
        <p className="text-sm text-muted">正式環境 · 最近 {markup.windowDays} 天 · 一點以 US${markup.pointUsd} 計 · 對照線 {markup.target}× · 不滿 {markup.minRuns} 次不判讀</p>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="py-1 pr-3">功能</th><th className="pr-3">價目版本</th><th className="pr-3 text-right">呼叫</th><th className="pr-3 text-right">白跑率</th><th className="pr-3 text-right">成本 US$</th><th className="pr-3 text-right">扣點折合 US$</th><th className="text-right">實際倍率</th></tr></thead>
          <tbody>{markup.rows.map(row => <tr key={`${row.feature}:${row.pricingVersion}`} className="border-t">
            <td className="py-1 pr-3">{FEATURE_NAMES[row.feature] ?? row.feature}</td>
            <td className="pr-3 font-mono text-xs">{row.pricingVersion}</td>
            <td className="pr-3 text-right">{row.runs}</td>
            <td className="pr-3 text-right">{Math.round((row.unchargedRuns / row.runs) * 100)}%</td>
            <td className="pr-3 text-right">{row.costUsd.toFixed(4)}</td>
            <td className="pr-3 text-right">{(row.points * markup.pointUsd).toFixed(4)}</td>
            <td className={`text-right ${row.verdict === "below" ? "text-red-700 font-semibold" : row.verdict === "too_few" ? "text-muted" : ""}`}>
              {row.markup === null ? "—" : `${row.markup.toFixed(2)}×`}{row.verdict === "too_few" && " 樣本不足"}
            </td>
          </tr>)}</tbody>
        </table></div>
        {markup.rows.length === 0 && <p className="text-sm text-muted">這段期間沒有用量紀錄。</p>}
        <p className="text-sm text-muted">白跑包含沒扣點的呼叫：離題、故事漏字、重送、識別失敗、補充失敗補償。成本是用 token 數與程式裡的費率估算，不是帳單金額，也未扣商店抽成。</p>
        <p className="text-sm">本月（{markup.monthStart.slice(0, 7)}，UTC）助手估算成本：US${markup.assistantMonthCostUsd.toFixed(4)}。每月與 Anthropic console 帳單比對一次，相差超過 10% 請修正 <code>lib/assistant/pricing.ts</code> 的費率。拍照做卡的供應商另外計費，不在此數字內。</p>
      </>}
    </section>
    <Link href="/admin/members" className="text-sky-accent">前往會員詳情處理退款</Link>
  </main>;
}
