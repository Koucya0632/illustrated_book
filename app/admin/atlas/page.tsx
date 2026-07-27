import Link from "next/link";
import { listAtlasReviewItems } from "@/lib/atlas-db";
import { createAtlasImageSignedUrls } from "@/lib/atlas/storage";
import type { AtlasReviewStatus } from "@/lib/atlas/types";
import AtlasReviewActions from "./AtlasReviewActions";

export const dynamic = "force-dynamic";

// The queue only offers the states a human acts on. pending / pending_auto are
// folded into the pending_review filter by listAtlasReviewItems.
type ReviewFilterStatus = "pending_review" | "approved" | "rejected" | "takedown";

const STATUS_LABELS: Record<AtlasReviewStatus, string> = {
  draft: "草稿",
  pending: "待審核（舊）",
  pending_auto: "機審中",
  pending_review: "待人工審核",
  approved: "已公開",
  rejected: "已退回",
  takedown: "已下架",
};

function allowedStatus(value: unknown): ReviewFilterStatus | "" {
  return value === "pending_review" ||
    value === "approved" ||
    value === "rejected" ||
    value === "takedown"
    ? value
    : "";
}

export default async function AdminAtlasPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = allowedStatus(searchParams.status ?? "pending_review");
  const rows = await listAtlasReviewItems(status, 120);
  const items = await Promise.all(
    rows.map(async (row) => {
      let thumbUrl: string | null = null;
      if (row.thumb_path) {
        try {
          thumbUrl = (
            await createAtlasImageSignedUrls({
              imagePath: row.thumb_path,
              thumbPath: row.thumb_path,
            })
          ).thumbUrl;
        } catch {
          thumbUrl = null;
        }
      }
      return { ...row, thumbUrl };
    }),
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">圖鑑審核</h1>
          <p className="mt-1 text-sm text-muted">共顯示 {items.length} 筆；公開圖鑑只讀取已核准資料。</p>
        </div>
        <div className="flex gap-4">
          <Link href="/admin/atlas/funnel" className="text-sm font-semibold text-sky-accent hover:underline">
            數據
          </Link>
          <Link href="/admin/atlas/collections" className="text-sm font-semibold text-sky-accent hover:underline">
            合集審核
          </Link>
          <Link href="/admin/atlas/reports" className="text-sm font-semibold text-sky-accent hover:underline">
            檢舉列表
          </Link>
          <Link href="/atlas/public" className="text-sm font-semibold text-sky-accent hover:underline">
            查看公開圖鑑
          </Link>
        </div>
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-xl2 bg-white p-4 shadow-card">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink">審核狀態</span>
          <select name="status" defaultValue={status} className="w-48 rounded-lg border border-black/10 bg-white px-3 py-2">
            <option value="">全部</option>
            <option value="pending_review">待人工審核</option>
            <option value="approved">已公開</option>
            <option value="rejected">已退回</option>
            <option value="takedown">已下架</option>
          </select>
        </label>
        <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">套用篩選</button>
        <Link href="/admin/atlas" className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-black/5">
          清除
        </Link>
      </form>

      <section className="space-y-4">
        {items.length === 0 && (
          <div className="rounded-xl2 bg-white p-8 text-center text-muted shadow-card">沒有符合條件的圖鑑送審。</div>
        )}
        {items.map((item) => (
          <article key={item.id} className="rounded-xl2 bg-white p-5 shadow-card">
            <div className="grid gap-4 md:grid-cols-[180px_1fr]">
              <div className="aspect-square overflow-hidden rounded-lg bg-cream">
                {item.thumbUrl ? (
                  <img src={item.thumbUrl} alt={item.lemma} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted">無縮圖</div>
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-sky-soft px-2.5 py-1 text-xs font-bold text-sky-accent">
                    {STATUS_LABELS[item.review_status] ?? item.review_status}
                  </span>
                  <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-ink">
                    {item.target_language.toUpperCase()}
                  </span>
                  {item.visibility !== "public" && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      {item.visibility}
                    </span>
                  )}
                </div>
                <h2 className="mt-3 text-xl font-bold text-ink">
                  {item.lemma}
                  <span className="ml-2 text-base font-medium text-muted">{item.display_zh_hant}</span>
                </h2>
                <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-lg bg-cream/60 p-4 text-sm sm:grid-cols-2">
                  <Meta label="主要類別" value={item.primary_label} />
                  <Meta label="細分類" value={item.fine_label ?? "—"} />
                  <Meta label="分類" value={item.category ?? "—"} />
                  <Meta label="送審者" value={item.username ?? "已刪除帳號"} />
                  <Meta label="Item ID" value={item.id} />
                  <Meta label="更新時間" value={new Date(item.updated_at).toLocaleString("zh-TW")} />
                  {item.public_slug && <Meta label="公開 slug" value={item.public_slug} />}
                </dl>
                {item.public_slug && item.review_status === "approved" && (
                  <Link
                    href={`/atlas/public/${item.public_slug}`}
                    className="mt-3 inline-block text-sm font-semibold text-sky-accent hover:underline"
                  >
                    查看公開頁
                  </Link>
                )}
                <AtlasReviewActions
                  id={item.id}
                  reviewStatus={item.review_status}
                  initialAttributionName={item.username ?? ""}
                />
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
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
