import Link from "next/link";
import { searchMembers } from "@/lib/admin/members";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: { q?: string; pro?: string };
}) {
  const q = typeof searchParams.q === "string" ? searchParams.q : "";
  const proOnly = searchParams.pro === "1";

  let members: Awaited<ReturnType<typeof searchMembers>> = [];
  let error = "";
  try {
    members = await searchMembers(q, { proOnly });
  } catch (err) {
    error = err instanceof Error ? err.message : "查詢失敗";
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">會員</h1>
        <p className="mt-1 text-sm text-muted">
          查詢帳號的 Pro 狀態、手動贈與與收回。營收、續訂與流失數字請看 App Store Connect —
          那裡才看得到退款與實收金額。
        </p>
      </header>

      <form className="grid gap-3 rounded-xl2 bg-white p-4 shadow-card sm:grid-cols-[1fr_auto_auto]">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink">搜尋</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="TJ UID、Email 或暱稱"
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm text-ink">
          <input type="checkbox" name="pro" value="1" defaultChecked={proOnly} />
          只看 Pro
        </label>
        <div className="flex items-end gap-2">
          <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">
            搜尋
          </button>
          <Link
            href="/admin/members"
            className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-black/5"
          >
            清除
          </Link>
        </div>
      </form>

      <p className="text-xs text-muted">
        Apple 登入的帳號多半是 @privaterelay.appleid.com 信箱，用他寄信給你的地址查不到人。
        請他到「我的 → 編輯個人檔案」讀取 UID，或直接從 App 內的意見回饋處理（那邊本來就帶著 UID）。
      </p>

      {error && <div className="rounded-xl2 bg-white p-6 text-rose-600 shadow-card">{error}</div>}

      {!error && members.length === 0 && (
        <div className="rounded-xl2 bg-white p-8 text-center text-muted shadow-card">
          沒有符合條件的帳號。
        </div>
      )}

      {members.length > 0 && (
        <div className="overflow-x-auto rounded-xl2 bg-white shadow-card">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b border-black/5 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">UID</th>
                <th className="px-4 py-3 font-medium">暱稱</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">方案</th>
                <th className="px-4 py-3 font-medium">到期</th>
                <th className="px-4 py-3 font-medium">註冊</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/members/${m.userId}`}
                      className="font-mono font-semibold text-sky-accent hover:underline"
                    >
                      {m.username}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink">{m.nickname ?? "—"}</td>
                  <td className="break-all px-4 py-3 text-muted">{m.email || "—"}</td>
                  <td className="px-4 py-3">
                    <TierBadge
                      tier={m.tier}
                      hasGrant={m.hasGrant}
                      hasSubscription={m.hasSubscription}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {m.expiresAt ? new Date(m.expiresAt).toLocaleDateString("zh-TW") : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(m.createdAt).toLocaleDateString("zh-TW")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function TierBadge({
  tier,
  hasGrant,
  hasSubscription,
}: {
  tier: string;
  hasGrant: boolean;
  hasSubscription: boolean;
}) {
  if (tier !== "pro") {
    return <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-muted">免費</span>;
  }
  // Which source is carrying them matters more than the tier itself: a comped
  // account and a paying account need completely different handling.
  const label = hasSubscription && hasGrant ? "訂閱＋贈與" : hasSubscription ? "訂閱" : "贈與";
  return (
    <span className="rounded-full bg-sky-soft px-2.5 py-1 text-xs font-bold text-sky-accent">
      Pro · {label}
    </span>
  );
}
