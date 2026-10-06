"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PRESET_DAYS = [30, 90, 365] as const;

export default function MemberEntitlementActions({
  userId,
  hasLiveGrant,
  lifetime,
}: {
  userId: string;
  hasLiveGrant: boolean;
  /** The live 永久權益 source, or null when the account holds none. */
  lifetime: string | null;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"lifetime" | "pro">("lifetime");
  const [days, setDays] = useState<number>(30);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function run(action: "grant" | "revoke" | "grant_lifetime" | "revoke_lifetime") {
    if (busy) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await fetch(`/api/admin/members/${userId}/entitlement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(action === "grant" ? { days } : {}), reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "操作失敗");
      setDone({ grant: "已贈與 Pro", revoke: "已收回 Pro 贈與", grant_lifetime: "已贈與永久會員，Android 與 iOS 共用", revoke_lifetime: "已收回永久會員贈與" }[action]);
      setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 grid gap-3 border-t border-black/5 pt-5">
      <fieldset className="flex flex-wrap gap-4" disabled={busy}>
        <legend className="mb-2 text-sm font-medium text-ink">贈與類型</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="grant-kind" checked={kind === "lifetime"} onChange={() => setKind("lifetime")} />
          永久會員
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="grant-kind" checked={kind === "pro"} onChange={() => setKind("pro")} />
          Pro（指定天數）
        </label>
      </fieldset>
      <p className="text-xs leading-relaxed text-muted">
        贈與綁定 Tuji 帳號，同一帳號在 Android 與 iOS 共用。永久會員沒有到期日；Pro 到期後仍保有永久會員。
      </p>
      {kind === "pro" && <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink">天數</span>
          <div className="flex gap-1">
            {PRESET_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={
                  days === d
                    ? "rounded-lg bg-sky-soft px-3 py-2 text-sm font-semibold text-sky-accent"
                    : "rounded-lg px-3 py-2 text-sm text-muted hover:bg-black/5"
                }
              >
                {d} 天
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={3650}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-24 rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
          </div>
        </label>
      </div>}

      <label className="text-sm">
        <span className="mb-1 block font-medium text-ink">理由（必填）</span>
        <input
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例：辨識出包補償 / 內容合作 / 審核用帳號"
          className="w-full rounded-lg border border-black/10 px-3 py-2"
        />
        <span className="mt-1 block text-xs text-muted">
          請填寫贈與或收回的原因，會保存在權限異動紀錄。
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm" role="status" aria-live="polite">
          {error && <span className="text-rose-600">{error}</span>}
          {done && <span className="text-sky-accent">{done}</span>}
        </span>
        <div className="flex gap-2">
          {kind === "pro" && hasLiveGrant && (
            <button
              type="button"
              onClick={() => run("revoke")}
              disabled={busy || !reason.trim()}
              className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-40"
            >
              收回 Pro 贈與
            </button>
          )}
          {kind === "lifetime" && (lifetime === "grant" || lifetime === "legacy_pro") && (
            <button
              type="button"
              onClick={() => run("revoke_lifetime")}
              disabled={busy || !reason.trim()}
              className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-40"
            >
              收回永久會員贈與
            </button>
          )}
          <button
            type="button"
            onClick={() => run(kind === "lifetime" ? "grant_lifetime" : "grant")}
            disabled={busy || !reason.trim() || (kind === "lifetime" && lifetime !== null) ||
              (kind === "pro" && (!Number.isInteger(days) || days < 1 || days > 3650))}
            className="rounded-lg bg-sky-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "處理中…" : kind === "pro" ? "贈與 Pro" : lifetime !== null ? "已持有永久會員" : "贈與永久會員"}
          </button>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        贈與與訂閱分開保存，收回贈與不會取消購買。商店購買的永久會員由原商店退款處理。
      </p>
    </div>
  );
}
