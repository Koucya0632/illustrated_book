"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { createRefundReview } from "@/lib/credits/refund-review";

type Case = Awaited<ReturnType<ReturnType<typeof createRefundReview>["readCases"]>>[number];
const errors: Record<string, string> = {
  refund_changed: "退款狀態已更新，請重新載入後核對。",
  refund_has_reservations: "這筆退款仍有進行中的預留，請等工作結束後再結案。",
  refund_already_resolved: "這筆退款已結案，請重新載入。",
  idempotency_conflict: "這次操作與原紀錄不同，請重新載入。",
  invalid_request: "請填寫處理理由並核對退款資料。",
};
export default function MemberCreditRefunds({ userId }: { userId: string }) {
  const router = useRouter();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [environment, setEnvironment] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Case | null>(null);
  const [reason, setReason] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const endpoint = `/api/admin/members/${userId}/credit-refunds`;
  async function reload() {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error("退款資料暫時無法讀取。");
    const result = await response.json(); setCases(result.cases); setEnvironment(result.environment);
  }
  useEffect(() => { reload().catch(error => setMessage(error.message)); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function resolve() {
    if (!selected || !reason.trim()) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestKey, transactionId: selected.transactionId, expectedEventAt: selected.eventAt,
          expectedRefundPoints: selected.refundPoints, expectedConsumedPoints: selected.consumedPoints, reason: reason.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(errors[result.error] ?? "操作未完成；請重試以確認同一次結案。");
      setSelected(null); setReason(""); setMessage("已保存結案紀錄。此帳號沒有其他待處理退款時，AI 使用會恢復。");
      await reload(); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作未完成。"); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl2 bg-white p-6 shadow-card">
    <h2 className="text-lg font-bold">點數退款</h2>
    <p className="mt-2 text-sm text-muted">{environment === "sandbox" ? "測試環境" : environment === "production" ? "正式環境" : ""}　已使用點數的退款須人工處理；結案只恢復使用資格，不補點、不扣其他點數。</p>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {cases?.length === 0 && <p className="mt-3 text-sm text-muted">沒有點數退款紀錄。</p>}
    {cases?.map(row => <div key={row.transactionId} className="mt-4 border-t border-black/5 pt-3 text-sm">
      <p>交易 {row.transactionId}　退款 {row.refundPoints} 點／已收回 {row.withdrawnPoints} 點／已使用 {row.consumedPoints} 點</p>
      {row.resolution ? <p className="mt-1 text-muted">已結案：{row.resolution.reason}</p> : row.needsReview ?
        <button disabled={busy || row.reserved > 0 || row.consumedPoints <= 0} className="mt-2 rounded-lg border px-3 py-2 disabled:opacity-50"
          onClick={() => { setSelected(row); setReason(""); setRequestKey(crypto.randomUUID()); setMessage(""); }}>
          {row.reserved > 0 ? "等待進行中工作結束" : "處理並結案"}</button> : <p className="text-muted">已自動收回退款點數。</p>}
    </div>)}
    {selected && <div className="mt-4 rounded-lg bg-black/5 p-4">
      <p>核對交易 {selected.transactionId}，已使用的退款點数為 {selected.consumedPoints} 點。</p>
      <label className="mt-3 block">人工處理理由
        <textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} disabled={busy}
          className="mt-1 block w-full rounded-lg border bg-white p-2" /></label>
      <p className="mt-2 text-muted">確認已完成人工處理後保存；Apple 退款及原始點數紀錄會保留。</p>
      <button disabled={busy || !reason.trim()} onClick={resolve} className="mt-3 rounded-lg bg-ink px-3 py-2 text-white disabled:opacity-50">{busy ? "保存中…" : "確認結案並恢復 AI"}</button>
      <button disabled={busy} onClick={() => setSelected(null)} className="ml-3">取消</button>
    </div>}
  </section>;
}
