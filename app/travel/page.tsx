import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUserId } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { loadTravelSite, travelCopy } from "@/lib/travel/site";

// Forced dynamic so names and copy render in the signed-in user's UI language.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "跟著 Moira 去旅遊：到了當地會看到的東西，日文怎麼說 · Tuji",
  description: "挑一個日本的景點，看那裡會遇到的東西和它們的日文。每個單字都有圖片、發音與例句。",
  alternates: { canonical: "/travel" },
  openGraph: {
    type: "website",
    siteName: "Tuji",
    locale: "zh_TW",
    url: "/travel",
    title: "跟著 Moira 去旅遊 · Tuji",
    description: "挑一個日本的景點，看那裡會遇到的東西和它們的日文。",
    images: ["/marketing/og-home.jpg"],
  },
};

export default async function TravelPage() {
  const userId = await getCurrentUserId();
  const lang = (userId ? await getSettings(userId) : DEFAULT_SETTINGS).uiLang;
  const site = await loadTravelSite(lang);
  const c = (key: Parameters<typeof travelCopy>[1], vars?: Record<string, string | number>) =>
    travelCopy(lang, key, vars);

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-7">
      <div className="rounded-[24px] bg-tuji-ink p-6 text-white sm:p-8">
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{c("title")}</h1>
        <p className="mt-1 text-sm text-white/70">{c("lead")}</p>
      </div>

      {site.cities.length === 0 ? (
        <p className="py-12 text-center text-tuji-ink3">{c("notOpen")}</p>
      ) : (
        site.cities.map((city) => (
          <section key={city.id} className="mt-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-extrabold text-tuji-ink">
                <Link href={`/travel/${city.id}`} className="hover:underline">
                  {city.name}
                </Link>
              </h2>
              <span className="text-xs font-bold text-tuji-ink3">
                {city.destinationName} · {c("spots", { n: city.spots.filter((s) => s.open).length })}
              </span>
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {city.spots.map((spot) =>
                spot.open ? (
                  <li key={spot.id}>
                    <Link
                      href={`/travel/${city.id}/${spot.id}`}
                      className="block rounded-[18px] bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover"
                    >
                      <div className="text-lg font-extrabold text-tuji-ink">{spot.name}</div>
                      <div className="mt-1 text-xs text-tuji-ink3">{c("things", { n: spot.wordIds.length })}</div>
                    </Link>
                  </li>
                ) : (
                  <li key={spot.id} className="rounded-[18px] bg-white/50 p-4">
                    <div className="text-lg font-extrabold text-tuji-ink3">{spot.name}</div>
                    <div className="mt-1 text-xs text-tuji-ink3">{c("notOpen")}</div>
                  </li>
                ),
              )}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
