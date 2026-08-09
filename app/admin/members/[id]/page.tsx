import Link from "next/link";
import { notFound } from "next/navigation";
import { getMemberDetail } from "@/lib/admin/members";
import { atlasLimitsForTier } from "@/lib/atlas/entitlement";
import MemberEntitlementActions from "./MemberEntitlementActions";

export const dynamic = "force-dynamic";

const CHANNEL_LABELS: Record<string, string> = {
  appstore: "App Store",
  grant: "手動贈與",
  grant_revoke: "收回贈與",
  transfer: "訂閱轉移",
};

function fmt(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString("zh-TW") : "—";
}

export default async function MemberDetailPage({ params }: { params: { id: string } }) {
  const detail = await getMemberDetail(params.id).catch(() => null);
  if (!detail) notFound();

  const { summary, effective, subscription, grants, ledger, usage } = detail;
  const limits = atlasLimitsForTier(effective.tier);
  const liveGrants = grants.filter(
    (g) => !g.revokedAt && new Date(g.expiresAt).getTime() > Date.now(),
  );

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <Link href="/admin/members" className="text-sm text-muted hover:text-ink">
        ← 會員列表
      </Link>

      <header className="rounded-xl2 bg-white p-6 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-ink">{summary.username}</h1>
          <span
            className={
              effective.tier === "pro"
                ? "rounded-full bg-sky-soft px-2.5 py-1 text-xs font-bold text-sky-accent"
                : "rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-muted"
            }
          >
            {effective.tier === "pro" ? "Pro" : "免費"}
          </span>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="暱稱" value={summary.nickname ?? "—"} />
          <Field label="Email" value={summary.email || "—"} />
          <Field label="註冊時間" value={fmt(summary.createdAt)} />
          <Field label="實際到期" value={effective.expiresAt ? fmt(effective.expiresAt) : "—"} />
        </dl>
        <p className="mt-4 rounded-lg bg-cream/60 p-3 text-xs leading-relaxed text-muted">
          「實際到期」是訂閱與贈與取聯集後的結果（到期日晚的那個勝出）。下面兩塊分開列出來源——
          決定怎麼回覆使用者的是「他的 Pro 從哪來」，不是「他是不是 Pro」。
        </p>
      </header>

      <section className="rounded-xl2 bg-white p-6 shadow-card">
        <h2 className="font-bold text-ink">App Store 訂閱</h2>
        {subscription ? (
          <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Field label="狀態" value={subscription.tier === "pro" ? "pro" : "free"} />
            <Field label="到期" value={fmt(subscription.expiresAt)} />
            <Field label="來源" value={subscription.source ?? "—"} />
            <Field label="最後更新" value={fmt(subscription.updatedAt)} />
            <Field
              label="Original transaction id"
              value={subscription.originalTransactionId ?? "—"}
            />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted">沒有訂閱紀錄——這個帳號從未完成購買驗證。</p>
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted">
          退款與取消由 App Store 通知自動處理，不需要人工收回。後台沒有、也不該有「取消訂閱」的按鈕。
        </p>
      </section>

      <section className="rounded-xl2 bg-white p-6 shadow-card">
        <h2 className="font-bold text-ink">手動贈與</h2>
        {grants.length === 0 ? (
          <p className="mt-2 text-sm text-muted">沒有贈與紀錄。</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {grants.map((g) => {
              const expired = new Date(g.expiresAt).getTime() <= Date.now();
              const dead = Boolean(g.revokedAt) || expired;
              return (
                <li
                  key={g.id}
                  className={`rounded-lg border border-black/5 p-3 text-sm ${dead ? "opacity-60" : "bg-cream/40"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">
                      {g.revokedAt ? "已收回" : expired ? "已過期" : "生效中"}
                    </span>
                    <span className="text-muted">到期 {fmt(g.expiresAt)}</span>
                  </div>
                  <p className="mt-1 text-ink">{g.reason}</p>
                  <p className="mt-1 text-xs text-muted">
                    {g.grantedBy} · {fmt(g.grantedAt)}
                    {g.revokedAt ? ` · 收回於 ${fmt(g.revokedAt)}：${g.revokeReason ?? ""}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <MemberEntitlementActions userId={summary.userId} hasLiveGrant={liveGrants.length > 0} />
      </section>

      <section className="rounded-xl2 bg-white p-6 shadow-card">
        <h2 className="font-bold text-ink">本月用量</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="自製圖鑑" value={`${usage.atlasSlots} / ${limits.atlasSlotsLimit}`} />
          <Field
            label="一般 AI 辨識"
            value={`${usage.primaryAiThisMonth} / ${limits.primaryAiSoftLimitMonthly}`}
          />
          <Field
            label="高精度辨識"
            value={`${usage.precisionAiThisMonth} / ${limits.precisionAiLimitMonthly}`}
          />
          <Field label="收藏的物見項目" value={`${usage.savedItems} / ${limits.savedItemsLimit}`} />
        </dl>
      </section>

      <section className="rounded-xl2 bg-white p-6 shadow-card">
        <h2 className="font-bold text-ink">權限異動紀錄</h2>
        {ledger.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            沒有異動紀錄。流水帳是從這次改版才開始記的，先前的變動沒有留下。
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {ledger.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-3 border-b border-black/5 pb-2">
                <span className="text-muted">{fmt(e.createdAt)}</span>
                <span className="font-medium text-ink">
                  {e.fromTier ?? "—"} → {e.toTier}
                </span>
                <span className="text-muted">{CHANNEL_LABELS[e.channel] ?? e.channel}</span>
                {e.reason && <span className="text-ink">{e.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="break-all font-medium text-ink">{value}</dd>
    </div>
  );
}
