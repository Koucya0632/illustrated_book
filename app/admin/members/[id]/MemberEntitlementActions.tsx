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
        body: JSON.stringify({ action, days, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "操作失敗");
      setDone(action === "grant" || action === "grant_lifetime" ? "已贈與" : "已收回");
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
      <div className="flex flex-wrap items-end gap-3">
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
      </div>

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
          一年後唯一能回答「這個人為什麼是 Pro」的就是這行字。
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          {error && <span className="text-rose-600">{error}</span>}
          {done && <span className="text-sky-accent">{done}</span>}
        </span>
        <div className="flex gap-2">
          {hasLiveGrant && (
            <button
              type="button"
              onClick={() => run("revoke")}
              disabled={busy || !reason.trim()}
              className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-40"
            >
              收回贈與
            </button>
          )}
          <button
            type="button"
            onClick={() => run("grant")}
            disabled={busy || !reason.trim()}
            className="rounded-lg bg-sky-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "處理中…" : "贈與 Pro"}
          </button>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        贈與不會動到 App Store 訂閱，收回也不會取消任何人的購買。補償付費用戶是安全的：
        兩個來源取聯集，Apple 下次續訂不會蓋掉你送的天數。
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-4">
        <span className="text-sm text-ink">
          永久權益：
          {lifetime === null
            ? "無"
            : lifetime === "appstore"
              ? "App Store 購買"
              : lifetime === "legacy_pro"
                ? "舊 Pro 轉移"
                : "贈與"}
        </span>
        <div className="flex gap-2">
          {(lifetime === "grant" || lifetime === "legacy_pro") && (
            <button
              type="button"
              onClick={() => run("revoke_lifetime")}
              disabled={busy || !reason.trim()}
              className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 disabled:opacity-40"
            >
              收回永久權益
            </button>
          )}
          {lifetime === null && (
            <button
              type="button"
              onClick={() => run("grant_lifetime")}
              disabled={busy || !reason.trim()}
              className="rounded-lg border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-accent disabled:opacity-40"
            >
              贈與永久權益
            </button>
          )}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        永久權益和 Pro 是兩個來源：Pro 到期後會回到永久會員。App Store 買的永久權益只能經 Apple 退款收回。
      </p>
    </div>
  );
}
