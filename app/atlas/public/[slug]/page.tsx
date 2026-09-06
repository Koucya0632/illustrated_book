import Link from "next/link";
import { notFound } from "next/navigation";
import { getAtlasPublicItem } from "@/lib/atlas-db";
import { atlasPublicImageUrl } from "@/lib/atlas/storage";
import { publicAuthor } from "@/lib/public-author";
import ReportButton from "./ReportButton";

export const dynamic = "force-dynamic";

export default async function PublicAtlasDetailPage(
  props: {
    params: Promise<{ slug: string }>;
  }
) {
  const params = await props.params;
  const slug = params.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const item = await getAtlasPublicItem(slug);
  if (!item) notFound();

  const imageUrl = atlasPublicImageUrl(item.image_public_path);
  const author = publicAuthor(item);

  return (
    <main className="mx-auto max-w-5xl px-5 py-6 sm:px-7">
      <Link href="/atlas/public" className="text-sm font-extrabold text-tuji-teal hover:underline">
        返回公開圖鑑
      </Link>
      <article className="mt-5 grid gap-6 lg:grid-cols-[minmax(280px,480px)_1fr]">
        <div className="overflow-hidden rounded-[22px] bg-white shadow-soft">
          <div className="aspect-square bg-tuji-bg">
            {imageUrl ? (
              <img src={imageUrl} alt={item.lemma} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm font-bold text-tuji-ink3">
                No image
              </div>
            )}
          </div>
        </div>
        <section className="rounded-[22px] bg-white p-6 shadow-soft">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-tuji-tealS px-3 py-1 text-xs font-extrabold text-tuji-teal">
              {item.target_language.toUpperCase()}
            </span>
            {item.category && (
              <span className="rounded-full bg-tuji-bg px-3 py-1 text-xs font-extrabold text-tuji-ink3">
                {item.category}
              </span>
            )}
          </div>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-tuji-ink">{item.lemma}</h1>
          <p className="mt-2 text-xl font-bold text-tuji-ink3">{item.display_zh_hant}</p>
          <dl className="mt-6 grid gap-3 text-sm">
            <Meta label="公開日期" value={new Date(item.published_at).toLocaleDateString("zh-TW")} />
            {/* Anonymous unless the author confirmed a public identity —
                `publicAuthor` is the only thing allowed to name them. */}
            <Meta label="來源" value={author ? `由 ${author.displayName} 分享` : "Tuji 公開圖鑑"} />
          </dl>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/atlas"
              className="rounded-2xl bg-tuji-yellow px-5 py-3 text-sm font-extrabold text-tuji-ink shadow-card"
            >
              建立我的圖鑑
            </Link>
            <Link
              href="/atlas/study"
              className="rounded-2xl bg-tuji-teal px-5 py-3 text-sm font-extrabold text-white shadow-card"
            >
              複習我的卡片
            </Link>
          </div>
          <div className="mt-6 border-t border-black/5 pt-4">
            <ReportButton slug={item.public_slug} />
          </div>
        </section>
      </article>
    </main>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-extrabold text-tuji-ink3">{label}</dt>
      <dd className="mt-1 font-bold text-tuji-ink">{value}</dd>
    </div>
  );
}
