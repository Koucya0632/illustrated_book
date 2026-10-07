"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const PRESET_POINTS = [1000, 4000, 7000];
const CREDIT_ERRORS: Record<string, string> = {
  invalid_credit_request: "請填寫有效的整數點數與理由（最多 500 字）",
  credits_not_enrolled: "請先贈與永久會員，再贈與點數",
  benefit_ineligible: "請先贈與永久會員，再贈與點數",
  credits_disabled: "目前未開放點數贈與",
  idempotency_conflict: "這次贈與的內容與先前送出不同，請重新整理後再操作",
  credits_unavailable: "點數服務暫時無法使用，請以相同內容重試",
};

export default function MemberEntitlementActions({ userId, lifetime, creditsEnabled }: {
  userId: string;
  lifetime: string | null;
  creditsEnabled: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"lifetime" | "credits">("lifetime");
  const [amount, setAmount] = useState(1000);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  // Retain the same key and content after an ambiguous network failure.
  const pending = useRef<{ requestKey: string; amount: number; reason: string } | null>(null);
  const inFlight = useRef(false);

  async function run(action: "grant_credits" | "grant_lifetime" | "revoke_lifetime") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(""); setDone("");
    try {
      if (action === "grant_credits" && !pending.current) {
        pending.current = { requestKey: crypto.randomUUID(), amount, reason: reason.trim() };
      }
      const res = await fetch(`/api/admin/members/${userId}/${action === "grant_credits" ? "credit-grants" : "entitlement"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "grant_credits" ? pending.current : { action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A 4xx rejection is definitive; 5xx or transport failures may follow a commit.
        if (res.status >= 400 && res.status < 500) pending.current = null;
        throw new Error(CREDIT_ERRORS[data.error] || data.error || "操作失敗");
      }
      setDone(action === "grant_credits" ? `已贈與 ${data.amount.toLocaleString()} 點${data.granted ? "" : "（先前已完成，未重複發點）"}` :
        action === "grant_lifetime" ? "已贈與永久會員，Android 與 iOS 共用" : "已收回永久會員贈與");
      pending.current = null;
      setReason(""); router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗");
    } finally { inFlight.current = false; setBusy(false); }
  }

  const retryPending = pending.current !== null;
  return (
    <div className="mt-5 grid gap-3 border-t border-black/5 pt-5">
      <fieldset className="flex flex-wrap gap-4" disabled={busy || retryPending}>
        <legend className="mb-2 text-sm font-medium text-ink">贈與類型</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="grant-kind" checked={kind === "lifetime"} onChange={() => setKind("lifetime")} />永久會員
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="grant-kind" checked={kind === "credits"} onChange={() => setKind("credits")} />點數
        </label>
      </fieldset>
      <p className="text-xs leading-relaxed text-muted">贈與綁定 Tuji 帳號，Android 與 iOS 共用。永久會員沒有到期日；手動贈與的點數永久保留。</p>
      {kind === "credits" && <>
        <fieldset disabled={busy || retryPending} className="grid gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">點數數量</legend>
          <div className="flex flex-wrap gap-2">
            {PRESET_POINTS.map(n => <button key={n} type="button" onClick={() => setAmount(n)}
              className={amount === n ? "rounded-lg bg-sky-soft px-3 py-2 text-sm font-semibold text-sky-accent" : "rounded-lg px-3 py-2 text-sm text-muted hover:bg-black/5"}>
              {n.toLocaleString()} 點
            </button>)}
          </div>
          <label className="text-sm">自訂點數
            <input type="number" min={1} max={2147483647} step={1} value={amount}
              onChange={e => setAmount(Number(e.target.value))} className="ml-2 w-40 rounded-lg border border-black/10 px-3 py-2" />
          </label>
        </fieldset>
        <p className="text-xs text-muted">{!creditsEnabled ? "目前未開放點數贈與。" : lifetime === null ? "此帳號尚未持有永久會員，請先贈與永久會員，再贈與點數。" : "點數贈與不計入購買收入，不影響每月免費贈點與簽到額度。"}</p>
      </>}
      <label className="text-sm">
        <span className="mb-1 block font-medium text-ink">理由（必填）</span>
        <input value={reason} maxLength={500} disabled={busy || retryPending} onChange={e => setReason(e.target.value)}
          placeholder="例：辨識出包補償 / 內容合作 / 審核用帳號" className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <span className="mt-1 block text-xs text-muted">理由、時間與操作來源會保存在贈與紀錄。</span>
      </label>
      {retryPending && <p className="text-xs text-muted">上次操作結果尚未確認，請重試相同贈與；重試不會重複發點。</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm" role="status" aria-live="polite">
          {error && <span className="text-rose-600">{error}</span>}{done && <span className="text-sky-accent">{done}</span>}
        </span>
        <div className="flex gap-2">
          {kind === "lifetime" && (lifetime === "grant" || lifetime === "legacy_pro") && <button type="button" onClick={() => run("revoke_lifetime")}
            disabled={busy || !reason.trim()} className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-40">收回永久會員贈與</button>}
          <button type="button" onClick={() => run(kind === "lifetime" ? "grant_lifetime" : "grant_credits")}
            disabled={busy || !reason.trim() || (kind === "lifetime" && lifetime !== null) ||
              (kind === "credits" && (!creditsEnabled || lifetime === null || !Number.isSafeInteger(amount) || amount < 1 || amount > 2147483647))}
            className="rounded-lg bg-sky-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? "處理中…" : kind === "credits" ? retryPending ? "重試點數贈與" : "贈與點數" : lifetime !== null ? "已持有永久會員" : "贈與永久會員"}
          </button>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">Pro 已停止新增贈與。歷史紀錄保留；商店購買的永久會員由原商店退款處理。</p>
    </div>
  );
}
