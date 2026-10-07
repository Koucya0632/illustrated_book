import Link from "next/link";
import { notFound } from "next/navigation";
import { getMemberDetail } from "@/lib/admin/members";
import { membershipTierOf } from "@/lib/atlas/entitlement";
import { membershipPolicy } from "@/lib/atlas/membership";
import { limitsForBilling } from "@/lib/atlas/membership-limits";
import MemberEntitlementActions from "./MemberEntitlementActions";
import { usesCreditBilling } from "@/lib/credits/legacy-server";
import { userCreditConfig } from "@/lib/credits/policy";
import { createAdminCreditGrants } from "@/lib/credits/admin-grants";
import { getSql } from "@/lib/db";
import MemberCreditRefunds from "./MemberCreditRefunds";

export const dynamic = "force-dynamic";

const CHANNEL_LABELS: Record<string, string> = {
  appstore: "App Store",
  play: "Google Play",
  lifetime_grant: "贈與永久會員",
  lifetime_revoke: "收回永久權益",
  lifetime_purchase: "購買永久會員",
  legacy_pro_migration: "舊 Pro 轉移",
  grant: "手動贈與",
  grant_revoke: "收回贈與",
  transfer: "訂閱轉移",
};

function fmt(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString("zh-TW") : "—";
}

export default async function MemberDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const detail = await getMemberDetail(params.id).catch(() => null);
  if (!detail) notFound();

  const { summary, effective, subscription, grants, lifetime, ledger, usage } = detail;
  const liveLifetime = lifetime.find((l) => !l.revokedAt) ?? null;
  const config = userCreditConfig(summary.userId);
  const billingMode = await usesCreditBilling(summary.userId) ? "credits" : "legacy";
  const tier = membershipTierOf(effective, billingMode);
  const limits = limitsForBilling(tier, membershipPolicy(), billingMode);
  const sql = getSql();
  const credits = sql ? await createAdminCreditGrants(sql).read({ userId: summary.userId, environment: config.environment }) : null;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <Link href="/admin/members" className="text-sm text-muted hover:text-ink">
        ← 會員列表
      </Link>

      <MemberCreditRefunds userId={summary.userId} />
      <header className="rounded-xl2 bg-white p-6 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-ink">{summary.username}</h1>
          <span
            className={
              tier === "free"
                ? "rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-muted"
                : "rounded-full bg-sky-soft px-2.5 py-1 text-xs font-bold text-sky-accent"
            }
          >
            {tier === "pro" ? "Pro" : tier === "lifetime" ? "永久會員" : "免費"}
          </span>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="暱稱" value={summary.nickname ?? "—"} />
          <Field label="Email" value={summary.email || "—"} />
          <Field label="註冊時間" value={fmt(summary.createdAt)} />
          <Field label="AI 計費" value={billingMode === "credits" ? "點數制" : "尚未啟用點數制"} />
          <Field label="永久會員" value={effective.hasLifetime ? "已持有（無到期日）" : "未持有"} />
        </dl>
        <p className="mt-4 rounded-lg bg-cream/60 p-3 text-xs leading-relaxed text-muted">
          Pro 已停售，符合資格的既有 Pro 已轉為永久會員點數制。歷史訂閱與贈與紀錄保留供查帳。
          權益綁定 Tuji 帳號，Android 與 iOS 共用。
        </p>
      </header>

      <section className="rounded-xl2 bg-white p-6 shadow-card">
        <h2 className="font-bold text-ink">歷史商店訂閱</h2>
        {subscription ? (
          <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Field label="狀態" value={subscription.tier === "pro" ? "pro" : "free"} />
            <Field label="到期" value={fmt(subscription.expiresAt)} />
            <Field label="來源" value={subscription.source === "appstore" ? "App Store" : subscription.source === "play" ? "Google Play" : subscription.source ?? "—"} />
            <Field label="最後更新" value={fmt(subscription.updatedAt)} />
            <Field
              label="Original transaction id"
              value={subscription.originalTransactionId ?? "—"}
            />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted">沒有 Pro 訂閱紀錄。永久會員購買另列於永久權益紀錄。</p>
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted">
          退款與取消由原購買商店處理；贈與與收回不會修改商店訂閱。
        </p>
      </section>

      <section className="rounded-xl2 bg-white p-6 shadow-card">
        <h2 className="font-bold text-ink">手動贈與</h2>
        {grants.length > 0 && (
          <>
          <h3 className="mt-3 text-sm font-bold text-ink">歷史 Pro 贈與</h3>
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
                      {g.revokedAt ? "已收回" : expired ? "已過期" : "歷史紀錄"}
                    </span>
                    <span className="text-muted">原期限至 {fmt(g.expiresAt)}</span>
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
          </>
        )}
        {lifetime.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-bold text-ink">永久權益紀錄</h3>
            <ul className="mt-2 space-y-2">
              {lifetime.map((l) => (
                <li
                  key={l.id}
                  className={`rounded-lg border border-black/5 p-3 text-sm ${l.revokedAt ? "opacity-60" : "bg-cream/40"}`}
                >
                  <span className="font-semibold text-ink">{l.revokedAt ? "已收回" : "生效中"}</span>
                  <span className="ml-2 text-muted">
                    {l.source === "appstore" ? "App Store 購買" : l.source === "legacy_pro" ? "舊 Pro 轉移" : "贈與"}
                  </span>
                  {l.reason && <p className="mt-1 text-ink">{l.reason}</p>}
                  <p className="mt-1 text-xs text-muted">
                    {l.grantedBy ?? "—"} · {fmt(l.acquiredAt)}
                    {l.revokedAt ? ` · 收回於 ${fmt(l.revokedAt)}：${l.revokeReason ?? ""}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
        <h3 className="mt-5 text-sm font-bold text-ink">點數贈與紀錄</h3>
        <p className="mt-2 text-sm text-muted">{config.environment === "sandbox" ? "沙盒環境" : "正式環境"} · 可用 {Number(credits?.available ?? 0).toLocaleString()} 點 · 處理中 {Number(credits?.reserved ?? 0).toLocaleString()} 點</p>
        {credits?.grants.length ? <ul className="mt-2 space-y-2">
          {credits.grants.map(g => <li key={g.requestKey} className="rounded-lg border border-black/5 bg-cream/40 p-3 text-sm">
            <span className="font-semibold text-ink">+{g.amount.toLocaleString()} 點（永久保留）</span>
            <p className="mt-1 text-ink">{g.reason}</p>
            <p className="mt-1 text-xs text-muted">{g.actor} · {fmt(g.createdAt)}</p>
          </li>)}
        </ul> : <p className="mt-2 text-sm text-muted">沒有點數贈與紀錄。</p>}
        <MemberEntitlementActions
          userId={summary.userId}
          creditsEnabled={config.mode === "live"}
          lifetime={liveLifetime?.source ?? null}
        />
      </section>

      <section className="rounded-xl2 bg-white p-6 shadow-card">
        <h2 className="font-bold text-ink">本月用量</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="自製圖鑑" value={`${usage.atlasSlots} / ${limits.atlasSlotsLimit}`} />
          <Field
            label="一般 AI 辨識"
            value={billingMode === "credits" ? `${usage.primaryAiThisMonth} 次（按點數使用）` : `${usage.primaryAiThisMonth} / ${limits.primaryAiSoftLimitMonthly}`}
          />
          <Field
            label="高精度辨識"
            value={billingMode === "credits" ? `${usage.precisionAiThisMonth} 次（按點數使用）` : `${usage.precisionAiThisMonth} / ${limits.precisionAiLimitMonthly}`}
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
