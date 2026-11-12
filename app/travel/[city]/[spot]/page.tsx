import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import WordCard from "@/components/WordCard";
import { getCurrentUserId } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS, type UiLang } from "@/lib/settings";
import { loadTravelSite, travelCopy } from "@/lib/travel/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ city: string; spot: string }> };

/** The spot, if it is open and belongs to this city. A closed spot has no page. */
async function findSpot(lang: UiLang, cityId: string, spotId: string) {
  const site = await loadTravelSite(lang);
  const city = site.cities.find((c) => c.id === cityId);
  const spot = city?.spots.find((s) => s.id === spotId && s.open);
  return city && spot ? { city, spot, words: site.wordsOf(spot) } : null;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { city: cityId, spot: spotId } = await props.params;
  const found = await findSpot("zh-Hant", cityId, spotId);
  if (!found) return {};
  const { city, spot, words } = found;
  const sample = words
    .slice(0, 6)
    .map((w) => `${w.chinese}（${w.word}）`)
    .join("、");
  const title = `${spot.name}會看到的東西，日文怎麼說（${words.length} 個）· Tuji`;
  const description = `到了${city.name}${spot.name}會遇到的東西：${sample}……每個單字都有圖片、發音與例句。`;
  const canonical = `/travel/${encodeURIComponent(city.id)}/${encodeURIComponent(spot.id)}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: "Tuji",
      locale: "zh_TW",
      url: canonical,
      title,
      description,
      images: [words.find((w) => w.imageUrl)?.imageUrl ?? "/marketing/og-home.jpg"],
    },
  };
}

export default async function TravelSpotPage(props: Props) {
  const { city: cityId, spot: spotId } = await props.params;
  const userId = await getCurrentUserId();
  const lang = (userId ? await getSettings(userId) : DEFAULT_SETTINGS).uiLang;
  const found = await findSpot(lang, cityId, spotId);
  if (!found) notFound();
  const { city, spot, words } = found;
  const c = (key: Parameters<typeof travelCopy>[1], vars?: Record<string, string | number>) =>
    travelCopy(lang, key, vars);

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <nav className="mb-4 flex items-center gap-2 text-xs font-bold text-tuji-ink3">
        <Link href="/travel" className="hover:text-tuji-ink">
          {c("title")}
        </Link>
        <span>›</span>
        <Link href={`/travel/${city.id}`} className="hover:text-tuji-ink">
          {city.name}
        </Link>
        <span>›</span>
        <span className="font-extrabold text-tuji-ink">{spot.name}</span>
      </nav>

      <div className="rounded-[24px] bg-tuji-ink p-6 text-white sm:p-8">
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          {c("seenHere", { name: spot.name })}
        </h1>
        <p className="mt-1 text-lg text-white/75" lang="ja">
          {spot.native} · {spot.reading}
        </p>
        <p className="mt-1 text-sm text-white/60">{c("seenLead", { name: spot.name, n: words.length })}</p>
      </div>

      <section className="mt-6">
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
          {words.map((w) => (
            <WordCard key={w.id} word={w} />
          ))}
        </div>
      </section>

      <p className="mt-10 text-center text-sm text-tuji-ink3">{c("inApp")}</p>
    </div>
  );
}
