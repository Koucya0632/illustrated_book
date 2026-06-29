import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { listAtlasFriendVisibleItems } from "@/lib/atlas-db";
import { createAtlasImageSignedUrls } from "@/lib/atlas/storage";

export const dynamic = "force-dynamic";
export const metadata = { title: "朋友圖鑑 · Tuji" };

export default async function FriendsAtlasPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/signin?next=/atlas/friends");

  const rows = await listAtlasFriendVisibleItems(userId, 80);
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
    <main className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-tuji-ink3">
            Friends Atlas
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-tuji-ink sm:text-3xl">
            朋友圖鑑
          </h1>
        </div>
        <Link
          href="/atlas"
          className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-tuji-ink shadow-soft"
        >
          回我的圖鑑
        </Link>
      </header>

      {items.length === 0 ? (
        <div className="rounded-[20px] bg-white p-10 text-center text-sm font-bold text-tuji-ink3 shadow-soft">
          目前沒有朋友分享的圖鑑項目。
        </div>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-[18px] bg-white shadow-soft">
              <div className="aspect-square bg-tuji-bg">
                {item.thumbUrl ? (
                  <img src={item.thumbUrl} alt={item.lemma} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm font-bold text-tuji-ink3">
                    No image
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="truncate text-lg font-extrabold text-tuji-ink">{item.lemma}</h2>
                  <span className="shrink-0 rounded-full bg-tuji-tealS px-2 py-1 text-[10px] font-extrabold text-tuji-teal">
                    {item.target_language.toUpperCase()}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-bold text-tuji-ink3">{item.display_zh_hant}</p>
                <p className="mt-3 truncate text-xs font-bold text-tuji-ink3">
                  {item.owner_username ? `由 ${item.owner_username} 分享` : "朋友分享"}
                </p>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
