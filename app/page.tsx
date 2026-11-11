import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PublicShell from "@/components/marketing/PublicShell";
import SceneTry from "@/components/marketing/SceneTry";
import { getPublicLang } from "@/lib/public-lang";
import { mt } from "@/lib/marketing-i18n";
import { APP_STORE_ID } from "@/lib/app-store-link";
import { getCategoriesFromDb } from "@/lib/categories-db";
import { SITE_URL, isPublicTopicCategory } from "@/lib/site";
import { FREE_STUDY_CATEGORIES } from "@/lib/study-membership";
import { localizeTopicPresets } from "@/lib/topic-presets";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getPublicLang();
  return {
    title: mt(lang, "meta.title"),
    description: mt(lang, "meta.desc"),
    alternates: { canonical: "/" },
  };
}

// schema.org app description, so search engines (and AI summaries built on
// them) can tell this page is a language-learning app, not a generic site.
const appJsonLd = {
  "@context": "https://schema.org",
  "@type": "MobileApplication",
  name: "Tuji",
  alternateName: "Tuji 日本的圖鑑與場面練習",
  description:
    "給留學、打工度假和旅遊的人：日本的圖鑑看圖認識當地的東西，場面練習聽懂店員和機器在問什麼。學日文，也能用同一本圖鑑學英文。",
  applicationCategory: "EducationalApplication",
  operatingSystem: "iOS, Android",
  inLanguage: ["zh-TW", "zh-CN", "ja", "en"],
  url: SITE_URL,
  downloadUrl: `https://apps.apple.com/app/id${APP_STORE_ID}`,
  image: `${SITE_URL}/brand/tuji-app-icon.png`,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

// Scene groups as released in tuji-ios Scenes/index.json (origin/main,
// 2026-11-11, iOS 1.5.0). Update together with "scene.listNote" when scenes ship.
const SCENE_GROUPS = [
  { id: "konbini-cafe", count: 3 },
  { id: "restaurants", count: 4 },
  { id: "airport", count: 2 },
  { id: "getting-around", count: 2 },
  { id: "hotels", count: 5 },
  { id: "shopping", count: 6 },
];
const SCENE_TOTAL = SCENE_GROUPS.reduce((n, g) => n + g.count, 0);

function SectionHead({ eyebrow, title, sub, dark }: { eyebrow: string; title: React.ReactNode; sub?: string; dark?: boolean }) {
  return (
    <div className="max-w-2xl">
      <div className={`text-[13px] font-bold uppercase tracking-[0.04em] ${dark ? "text-tuji-paper/60" : "text-tuji-ink3"}`}>
        {eyebrow}
      </div>
      <h2 className={`mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl ${dark ? "text-tuji-paper" : "text-tuji-ink"}`}>
        {title}
      </h2>
      {sub && <p className={`mt-4 text-base leading-7 ${dark ? "text-tuji-paper/80" : "text-tuji-ink2"}`}>{sub}</p>}
    </div>
  );
}

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 814 1000" aria-hidden="true" className={className} fill="currentColor">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  );
}

function PlayLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M4.3 2.2c-.2.2-.3.6-.3 1v17.6c0 .4.1.8.3 1l9.8-9.8L4.3 2.2zm10.7 10.7 2.9 2.9-11.9 6.8 9-9.7zm0-1.8-9-9.7 11.9 6.8-2.9 2.9zm3.9-2.2 3 1.7c.9.5.9 1.4 0 1.9l-3 1.7-3.1-2.6 3.1-2.7z" />
    </svg>
  );
}

export default async function MarketingHomePage() {
  const lang = await getPublicLang();
  const topics = (await getCategoriesFromDb(lang)).filter((c) => isPublicTopicCategory(c.id));
  const topicName = new Map(topics.map((c) => [c.id, c.nameZh]));
  const presets = localizeTopicPresets(lang, new Set(topicName.keys()));
  const free = new Set(FREE_STUDY_CATEGORIES);

  return (
    <PublicShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }} />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-12 lg:grid-cols-[1fr_1fr] lg:pb-24 lg:pt-20">
          <div>
            {/* Status label: 3px leading edge instead of a pill. */}
            <div className="inline-flex items-center gap-2 border-l-3 border-tuji-current bg-tuji-paper2 py-1.5 pl-3 pr-3.5 text-[13px] font-bold tracking-[0.04em] text-tuji-ink2">
              <span className="h-2 w-2 rounded-full bg-tuji-current" />
              {mt(lang, "hero.badge")}
            </div>
            <h1 className="mt-6 max-w-2xl font-display text-[2.1rem] font-extrabold leading-[1.15] tracking-tight text-tuji-ink sm:text-6xl">
              {mt(lang, "hero.title1")}
              <br />
              {mt(lang, "hero.title2")}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-tuji-ink2">{mt(lang, "hero.subhead")}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/download?platform=ios"
                className="tuji-press inline-flex items-center justify-center gap-2 bg-tuji-current px-7 py-4 text-lg font-extrabold text-tuji-ink"
              >
                {mt(lang, "cta.download")}
              </Link>
              <Link
                href="/download?platform=android"
                className="inline-flex items-center justify-center gap-2 bg-tuji-paper3 px-7 py-4 text-lg font-extrabold text-tuji-ink transition duration-120 hover:bg-tuji-ink hover:text-tuji-paper"
              >
                {mt(lang, "cta.downloadAndroid")}
              </Link>
            </div>
            <p className="mt-5 text-sm text-tuji-ink3">
              {mt(lang, "hero.browse")}{" "}
              <Link href="/cards" className="font-bold text-tuji-ink underline underline-offset-4">
                {mt(lang, "hero.browseLink")}
              </Link>
            </p>
          </div>

          {/* A real counter photo with the clerk's line, and the app's own
              topic screen butted against it. No float shadow: depth is the
              ink frame of the phone. */}
          <div className="relative mx-auto h-[460px] w-full max-w-[540px] sm:h-[560px]">
            <Image
              src="/marketing/scene-konbini.webp"
              alt={mt(lang, "hero.sceneAlt")}
              width={900}
              height={1350}
              priority
              className="absolute left-0 top-0 h-full w-[76%] object-cover"
            />
            <div className="absolute left-4 top-5 max-w-[60%] bg-tuji-paper px-4 py-3 sm:left-6 sm:top-7">
              <div className="text-[12px] font-bold tracking-[0.04em] text-tuji-ink3">{mt(lang, "hero.clerk")}</div>
              <p lang="ja" className="font-ja text-2xl font-bold leading-snug text-tuji-ink">
                温めますか？
              </p>
            </div>
            <Image
              src="/marketing/atlas-topic-konbini.webp"
              alt={mt(lang, "hero.screenAlt")}
              width={660}
              height={1434}
              className="absolute bottom-0 right-0 w-[42%] border-[6px] border-tuji-ink"
            />
          </div>
        </div>
      </section>

      {/* ── 主題組合 ─────────────────────────────────────────── */}
      {presets.length > 0 && (
        <section id="presets" className="scroll-mt-20 bg-tuji-paper2 py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHead eyebrow={mt(lang, "who.eyebrow")} title={mt(lang, "who.title")} sub={mt(lang, "who.subtitle")} />
            <div className="mt-10 grid gap-px bg-tuji-rule md:grid-cols-3">
              {presets.map((p) => {
                const allFree = p.categoryIds.every((id) => free.has(id));
                return (
                  <article key={p.id} className="flex flex-col bg-tuji-paper p-7">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-display text-2xl font-extrabold tracking-tight text-tuji-ink">{p.name}</h3>
                      {allFree && (
                        <span className="bg-tuji-ink px-3 py-1 text-[13px] font-bold text-tuji-paper">
                          {mt(lang, "who.allFree")}
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-[15px] leading-7 text-tuji-ink2">{mt(lang, `who.${p.id}`)}</p>
                    <ul className="mt-5 flex flex-wrap gap-2">
                      {p.categoryIds.map((id) => (
                        <li key={id}>
                          <Link
                            href={`/category/${id}`}
                            className="inline-block bg-tuji-paper2 px-3 py-1.5 text-sm font-bold text-tuji-ink transition duration-120 hover:bg-tuji-paper3"
                          >
                            {topicName.get(id)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── 圖鑑 ─────────────────────────────────────────────── */}
      <section id="atlas" className="scroll-mt-20 py-16 lg:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-[1fr_1fr]">
          <div className="flex justify-center gap-4 sm:gap-6">
            <Image
              src="/marketing/atlas-topic-konbini.webp"
              alt={mt(lang, "atlas.alt1")}
              width={660}
              height={1434}
              className="w-[46%] max-w-[250px] self-start"
            />
            <Image
              src="/marketing/atlas-word.webp"
              alt={mt(lang, "atlas.alt2")}
              width={660}
              height={1434}
              className="mt-14 w-[46%] max-w-[250px] self-start"
            />
          </div>
          <div>
            <SectionHead
              eyebrow={mt(lang, "atlas.eyebrow")}
              title={
                <>
                  {mt(lang, "atlas.title1")}
                  <br />
                  {mt(lang, "atlas.title2")}
                </>
              }
              sub={mt(lang, "atlas.body")}
            />
            <dl className="mt-8 border-t border-tuji-rule">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-4 border-b border-tuji-rule py-3.5">
                  <dt className="w-24 shrink-0 font-bold text-tuji-ink">{mt(lang, `atlas.r${i}t`)}</dt>
                  <dd className="text-tuji-ink2">{mt(lang, `atlas.r${i}b`)}</dd>
                </div>
              ))}
            </dl>
            <Link
              href="/cards"
              className="tuji-press mt-8 inline-flex items-center gap-2 bg-tuji-current px-6 py-3.5 font-extrabold text-tuji-ink"
            >
              {mt(lang, "atlas.cta")}
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Plain links into /category/* — the only path a crawler has from the
            homepage into the public word pages. Kept, quieter, below the atlas. */}
        {topics.length > 0 && (
          <div className="mx-auto mt-16 max-w-6xl px-6">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.04em] text-tuji-ink3">{mt(lang, "atlas.all")}</h3>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              {topics.map((c) => (
                <li key={c.id}>
                  <Link href={`/category/${c.id}`} className="text-[15px] font-bold text-tuji-ink2 transition duration-120 hover:text-tuji-ink">
                    {c.nameZh}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── 場面 ─────────────────────────────────────────────── */}
      <section id="scenes" className="scroll-mt-20 bg-tuji-ink py-16 text-tuji-paper lg:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.05fr]">
            <div>
              <SectionHead dark eyebrow={mt(lang, "scene.eyebrow")} title={mt(lang, "scene.title")} sub={mt(lang, "scene.body1")} />
              <p className="mt-4 max-w-2xl text-base leading-7 text-tuji-paper/80">{mt(lang, "scene.body2")}</p>
              <p className="mt-6 max-w-2xl border-t border-tuji-paper/15 pt-4 text-sm leading-6 text-tuji-paper/60">
                {mt(lang, "scene.note")}
              </p>
            </div>
            <SceneTry
              question="温めますか？"
              response="お願いします／そのままで大丈夫です"
              choices={[
                { id: "a", text: mt(lang, "scene.choiceA"), correct: true },
                { id: "b", text: mt(lang, "scene.choiceB"), correct: false },
                { id: "c", text: mt(lang, "scene.choiceC"), correct: false },
              ]}
              copy={{
                label: mt(lang, "scene.tryLabel"),
                tag: mt(lang, "scene.tryTag"),
                asks: mt(lang, "scene.asks"),
                groupLabel: mt(lang, "scene.groupLabel"),
                prompt: mt(lang, "scene.prompt"),
                right: mt(lang, "scene.right"),
                wrong: mt(lang, "scene.wrong"),
                reply: mt(lang, "scene.reply"),
                explain: mt(lang, "scene.explain"),
              }}
            />
          </div>

          <div className="mt-16">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h3 className="font-display text-xl font-extrabold">{mt(lang, "scene.listTitle", { n: SCENE_TOTAL })}</h3>
              <p className="text-sm text-tuji-paper/60">{mt(lang, "scene.listNote")}</p>
            </div>
            <ul className="mt-5 grid grid-cols-2 gap-px bg-tuji-paper/15 sm:grid-cols-3 lg:grid-cols-6">
              {SCENE_GROUPS.map((g) => (
                <li key={g.id} className="bg-tuji-ink p-5">
                  <div className="font-bold">{mt(lang, `scene.g.${g.id}`)}</div>
                  <div className="mt-1 text-sm text-tuji-paper/60">{mt(lang, "scene.count", { n: g.count })}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── 還有：自製圖鑑、物見、Moira ─────────────────────────── */}
      <section id="more" className="scroll-mt-20 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHead eyebrow={mt(lang, "more.eyebrow")} title={mt(lang, "more.title")} />
          <div className="mt-10 grid gap-px bg-tuji-rule md:grid-cols-3">
            <article id="atlas-custom" className="scroll-mt-20 bg-tuji-paper2 p-7">
              <h3 className="text-xl font-extrabold tracking-tight text-tuji-ink">{mt(lang, "nav.custom")}</h3>
              <p className="mt-3 text-[15px] leading-7 text-tuji-ink2">{mt(lang, "more.customBody")}</p>
            </article>
            <article id="community" className="scroll-mt-20 bg-tuji-paper2 p-7">
              <h3 className="text-xl font-extrabold tracking-tight text-tuji-ink">{mt(lang, "nav.community")}</h3>
              <p className="mt-3 text-[15px] leading-7 text-tuji-ink2">{mt(lang, "more.commBody")}</p>
            </article>
            <article className="bg-tuji-paper2 p-7">
              <h3 className="text-xl font-extrabold tracking-tight text-tuji-ink">Moira</h3>
              <p className="mt-3 text-[15px] leading-7 text-tuji-ink2">{mt(lang, "more.moiraBody")}</p>
            </article>
          </div>
        </div>
      </section>

      {/* ── 費用 ─────────────────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-20 pb-16 lg:pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHead eyebrow={mt(lang, "price.eyebrow")} title={mt(lang, "price.title")} />
          <div className="mt-10 grid gap-px bg-tuji-rule md:grid-cols-2">
            <article className="bg-tuji-paper2 p-7 sm:p-9">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-display text-2xl font-extrabold text-tuji-ink">{mt(lang, "price.free")}</h3>
                <span className="text-sm text-tuji-ink3">{mt(lang, "price.freeTag")}</span>
              </div>
              <ul className="mt-5 list-disc space-y-2 pl-5 text-tuji-ink2">
                <li>{mt(lang, "price.free1")}</li>
                <li>{mt(lang, "price.free2")}</li>
                <li>{mt(lang, "price.free3")}</li>
              </ul>
            </article>
            <article className="bg-tuji-ink p-7 text-tuji-paper sm:p-9">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-display text-2xl font-extrabold">{mt(lang, "price.member")}</h3>
                <span className="font-display text-2xl font-extrabold">US$1.99</span>
              </div>
              <ul className="mt-5 list-disc space-y-2 pl-5 text-tuji-paper/85">
                <li>{mt(lang, "price.member1")}</li>
                <li>{mt(lang, "price.member2")}</li>
                <li>{mt(lang, "price.member3")}</li>
              </ul>
              <p className="mt-5 text-sm text-tuji-paper/60">{mt(lang, "price.memberNote")}</p>
            </article>
          </div>
        </div>
      </section>

      {/* ── 下載 ─────────────────────────────────────────────── */}
      <section id="download" className="scroll-mt-20 bg-tuji-current py-16 lg:py-20">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-tuji-ink sm:text-5xl">{mt(lang, "dl.title")}</h2>
            <p className="mt-3 text-lg text-tuji-ink2">{mt(lang, "dl.subhead")}</p>
          </div>
          {/* The section is the yellow; the badges are ink blocks on it. */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <a href="/download?platform=ios" className="tuji-press inline-flex items-center gap-3 bg-tuji-ink px-6 py-3.5 text-tuji-paper">
              <AppleLogo className="h-7 w-7" />
              <span className="text-left">
                <span className="block text-[12px] font-bold text-tuji-paper/70">Download on the</span>
                <span className="block font-display text-lg font-extrabold leading-tight">App Store</span>
              </span>
            </a>
            <a href="/download?platform=android" className="tuji-press inline-flex items-center gap-3 bg-tuji-ink px-6 py-3.5 text-tuji-paper">
              <PlayLogo className="h-7 w-7" />
              <span className="text-left">
                <span className="block text-[12px] font-bold text-tuji-paper/70">GET IT ON</span>
                <span className="block font-display text-lg font-extrabold leading-tight">Google Play</span>
              </span>
            </a>
            <Link
              href="/support"
              className="inline-flex items-center justify-center bg-tuji-paper/40 px-6 py-3.5 font-bold text-tuji-ink transition duration-120 hover:bg-tuji-paper"
            >
              {mt(lang, "dl.contact")}
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
