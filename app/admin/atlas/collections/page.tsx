import Link from "next/link";
import { listAtlasCollectionReviewItems } from "@/lib/atlas-db";
import { atlasPublicImageUrl } from "@/lib/atlas/storage";
import type { AtlasCollectionReviewStatus } from "@/lib/atlas/types";
import AtlasCollectionReviewActions from "./AtlasCollectionReviewActions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  pending_review: "待人工審核",
  approved: "已公開",
  rejected: "已退回",
  takedown: "已下架",
};

function allowedStatus(value: unknown): AtlasCollectionReviewStatus | "" {
  return value === "pending_review" ||
    value === "approved" ||
    value === "rejected" ||
    value === "takedown"
    ? value
    : "";
}

export default async function AdminAtlasCollectionsPage(
  props: {
    searchParams: Promise<{ status?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const status = allowedStatus(searchParams.status ?? "pending_review");
  const rows = await listAtlasCollectionReviewItems(status, 120);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">合集審核</h1>
          <p className="mt-1 text-sm text-muted">共 {rows.length} 筆；公開圖鑑只讀取已核准的合集。</p>
        </div>
        <Link href="/admin/atlas" className="text-sm font-semibold text-sky-accent hover:underline">
          ← 圖鑑審核
        </Link>
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-xl2 bg-white p-4 shadow-card">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink">審核狀態</span>
          <select
            name="status"
            defaultValue={status}
            className="w-48 rounded-lg border border-black/10 bg-white px-3 py-2"
          >
            <option value="">全部</option>
            <option value="pending_review">待人工審核</option>
            <option value="approved">已公開</option>
            <option value="rejected">已退回</option>
            <option value="takedown">已下架</option>
          </select>
        </label>
        <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">套用篩選</button>
        <Link
          href="/admin/atlas/collections"
          className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-black/5"
        >
          清除
        </Link>
      </form>

      <section className="space-y-4">
        {rows.length === 0 && (
          <div className="rounded-xl2 bg-white p-8 text-center text-muted shadow-card">沒有符合條件的合集送審。</div>
        )}
        {rows.map((c) => {
          const coverUrl = atlasPublicImageUrl(c.cover_image_path);
          return (
            <article key={c.id} className="rounded-xl2 bg-white p-5 shadow-card">
              <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                <div className="aspect-square overflow-hidden rounded-lg bg-cream">
                  {coverUrl ? (
                    <img src={coverUrl} alt={c.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted">無封面</div>
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-sky-soft px-2.5 py-1 text-xs font-bold text-sky-accent">
                      {STATUS_LABELS[c.review_status] ?? c.review_status}
                    </span>
                    <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-ink">
                      {c.target_language.toUpperCase()}
                    </span>
                    <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-ink">
                      內容 {c.item_count}
                    </span>
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-ink">{c.title}</h2>
                  {c.description && <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{c.description}</p>}
                  <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-lg bg-cream/60 p-4 text-sm sm:grid-cols-2">
                    <Meta label="作者" value={c.author_username ?? "已刪除帳號"} />
                    <Meta label="Collection ID" value={c.id} />
                    <Meta label="公開 slug" value={c.slug} />
                    <Meta label="更新時間" value={new Date(c.updated_at).toLocaleString("zh-TW")} />
                  </dl>
                  {c.review_status === "approved" && (
                    <Link
                      href={`/atlas/public/collections/${c.slug}`}
                      className="mt-3 inline-block text-sm font-semibold text-sky-accent hover:underline"
                    >
                      查看公開頁
                    </Link>
                  )}
                  <AtlasCollectionReviewActions id={c.id} reviewStatus={c.review_status} />
                </div>
              </div>
            </article>
          );
        })}
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
