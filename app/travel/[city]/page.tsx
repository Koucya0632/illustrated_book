import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { loadTravelSite, travelCopy } from "@/lib/travel/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ city: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { city: cityId } = await props.params;
  const site = await loadTravelSite("zh-Hant");
  const city = site.cities.find((c) => c.id === cityId);
  if (!city) return {};
  const open = city.spots.filter((s) => s.open);
  const names = open.map((s) => s.name).join("、");
  const title = `${city.name}的景點會看到什麼：日文怎麼說 · Tuji`;
  const description = `${city.name}的${names}，到了當地會遇到的東西和它們的日文。每個單字都有圖片、發音與例句。`;
  const canonical = `/travel/${encodeURIComponent(city.id)}`;
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
      images: [open.flatMap((s) => site.wordsOf(s)).find((w) => w.imageUrl)?.imageUrl ?? "/marketing/og-home.jpg"],
    },
  };
}

export default async function TravelCityPage(props: Props) {
  const { city: cityId } = await props.params;
  const userId = await getCurrentUserId();
  const lang = (userId ? await getSettings(userId) : DEFAULT_SETTINGS).uiLang;
  const site = await loadTravelSite(lang);
  const city = site.cities.find((c) => c.id === cityId);
  if (!city) notFound();
  const c = (key: Parameters<typeof travelCopy>[1], vars?: Record<string, string | number>) =>
    travelCopy(lang, key, vars);

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <nav className="mb-4 flex items-center gap-2 text-xs font-bold text-tuji-ink3">
        <Link href="/travel" className="hover:text-tuji-ink">
          {c("title")}
        </Link>
        <span>›</span>
        <span className="font-extrabold text-tuji-ink">{city.name}</span>
      </nav>

      <div className="rounded-[24px] bg-tuji-ink p-6 text-white sm:p-8">
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{city.name}</h1>
        <p className="mt-1 text-sm text-white/70">
          {city.destinationName} · {c("spots", { n: city.spots.filter((s) => s.open).length })}
        </p>
      </div>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {city.spots.map((spot) => {
          if (!spot.open) {
            return (
              <li key={spot.id} className="rounded-[18px] bg-white/50 p-4">
                <div className="text-lg font-extrabold text-tuji-ink3">{spot.name}</div>
                <div className="mt-1 text-xs text-tuji-ink3">{c("notOpen")}</div>
              </li>
            );
          }
          const words = site.wordsOf(spot);
          return (
            <li key={spot.id}>
              <Link
                href={`/travel/${city.id}/${spot.id}`}
                className="block rounded-[18px] bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-lg font-extrabold text-tuji-ink">{spot.name}</span>
                  <span className="text-xs text-tuji-ink3" lang="ja">
                    {spot.reading}
                  </span>
                </div>
                <p className="mt-2 text-sm text-tuji-ink2" lang="ja">
                  {words.map((w) => w.word).join("、")}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
