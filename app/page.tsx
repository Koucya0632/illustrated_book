import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Mascot from "@/components/tuji/Mascot";
import PublicShell from "@/components/marketing/PublicShell";
import imageUrls from "@/lib/image-urls.json";
import { getPublicLang } from "@/lib/public-lang";
import { mt } from "@/lib/marketing-i18n";
import type { UiLang } from "@/lib/settings";

// Word images live in Supabase Storage (see next.config.js). `/public/word-images/`
// is gitignored and never deployed, so local paths 404 in prod — resolve the
// deployed URL from the canonical id→URL map instead.
const wordImg = (id: string) => (imageUrls as Record<string, string>)[id];

export function generateMetadata(): Metadata {
  const lang = getPublicLang();
  return {
    title: mt(lang, "meta.title"),
    description: mt(lang, "meta.desc"),
  };
}

const APP_ICON_SRC = "/brand/tuji-app-icon.png";
const HERO_CAPTURE_IMAGE = "/marketing/atlas-capture-cards.webp";

// Marquee showcase: English headword (constant) + a per-language gloss looked up
// as `mq.<id>` (hidden for the English UI). `src` resolves from the word id.
const marqueeRowA = [
  { id: "alarm-clock", en: "alarm clock" },
  { id: "headphones", en: "headphones" },
  { id: "rice-cooker", en: "rice cooker" },
  { id: "bicycle", en: "bicycle" },
  { id: "mug", en: "mug" },
  { id: "vending-machine", en: "vending machine" },
  { id: "scissors", en: "scissors" },
  { id: "toaster", en: "toaster" },
];

const marqueeRowB = [
  { id: "convenience-store", en: "convenience store" },
  { id: "subway", en: "subway" },
  { id: "pan", en: "pan" },
  { id: "towel", en: "towel" },
  { id: "bookshelf", en: "bookshelf" },
  { id: "taxi", en: "taxi" },
  { id: "kettle", en: "kettle" },
  { id: "shopping-cart", en: "shopping cart" },
];

const howSteps = [
  { step: "01", tKey: "how.s1t", bKey: "how.s1b", pose: "face" as const },
  { step: "02", tKey: "how.s2t", bKey: "how.s2b", pose: "think" as const },
  { step: "03", tKey: "how.s3t", bKey: "how.s3b", pose: "cheer" as const },
];

const features = [
  { icon: "🖼️", tKey: "feat.f1t", bKey: "feat.f1b" },
  { icon: "⏰", tKey: "feat.f2t", bKey: "feat.f2b" },
  { icon: "✏️", tKey: "feat.f3t", bKey: "feat.f3b" },
  { icon: "🔊", tKey: "feat.f4t", bKey: "feat.f4b" },
  { icon: "🌏", tKey: "feat.f5t", bKey: "feat.f5b" },
  { icon: "📈", tKey: "feat.f6t", bKey: "feat.f6b" },
];

const atlasTagKeys = ["atlas.tag1", "atlas.tag2", "atlas.tag3", "atlas.tag4"];

const atlasSteps = [
  { step: "1", tKey: "atlas.s1t", bKey: "atlas.s1b" },
  { step: "2", tKey: "atlas.s2t", bKey: "atlas.s2b" },
  { step: "3", tKey: "atlas.s3t", bKey: "atlas.s3b" },
  { step: "4", tKey: "atlas.s4t", bKey: "atlas.s4b" },
];

const commSteps = [
  { step: "1", tKey: "comm.s1t", bKey: "comm.s1b" },
  { step: "2", tKey: "comm.s2t", bKey: "comm.s2b" },
  { step: "3", tKey: "comm.s3t", bKey: "comm.s3b" },
  { step: "4", tKey: "comm.s4t", bKey: "comm.s4b" },
];

// Keep the public count in sync with the generated canonical image map instead
// of baking a catalog size into the marketing page.
const heroStats = [
  { value: String(Object.keys(imageUrls).length), lKey: "hero.stat1l" },
  { value: "EN·JA", lKey: "hero.stat2l" },
  { value: "AI", lKey: "hero.stat3l" },
];

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 814 1000" aria-hidden="true" className={className} fill="currentColor">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  );
}

function MarqueeCard({ item, lang }: { item: { id: string; en: string }; lang: UiLang }) {
  const gloss = mt(lang, `mq.${item.id}`);
  return (
    <div className="flex w-44 shrink-0 items-center gap-3 bg-tuji-paper2 p-2.5">
      {/* `next/image`, not `<img>`: these render at 48x48 but the bucket objects
          are ~1.5MB at 1536x1024, and this page is public and crawlable — a
          single view pulled ~24MB straight from Supabase Storage, which is what
          exhausted the egress quota on 2026-08-19. The optimizer serves an
          actual 48px WebP and bills the transfer to Vercel instead. */}
      <Image
        src={wordImg(item.id)}
        alt=""
        width={48}
        height={48}
        loading="lazy"
        className="h-12 w-12 shrink-0 bg-tuji-paper3 object-cover"
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-tuji-ink">{item.en}</div>
        {gloss && <div className="truncate text-[13px] text-tuji-ink3">{gloss}</div>}
      </div>
    </div>
  );
}

function MarqueeRow({
  items,
  lang,
  reverse,
}: {
  items: { id: string; en: string }[];
  lang: UiLang;
  reverse?: boolean;
}) {
  const track = [...items, ...items];
  return (
    <div className="overflow-hidden" aria-hidden="true">
      <div className={`flex w-max gap-3 ${reverse ? "tuji-marquee-reverse" : "tuji-marquee"}`}>
        {track.map((item, index) => (
          <MarqueeCard key={`${item.id}-${index}`} item={item} lang={lang} />
        ))}
      </div>
    </div>
  );
}

export default function MarketingHomePage() {
  const lang = getPublicLang();
  return (
    <PublicShell>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-16 pt-12 lg:grid-cols-[0.94fr_1.06fr] lg:pb-24 lg:pt-20">
          <div>
            {/* Status label: 3px leading edge (bw3) instead of a pill. The dot
                stays round — status dots are one of the three things allowed
                to be circular. */}
            <div className="inline-flex items-center gap-2 border-l-3 border-tuji-current bg-tuji-paper2 py-1.5 pl-3 pr-3.5 text-[13px] font-bold tracking-[0.04em] text-tuji-ink2">
              <span className="h-2 w-2 rounded-full bg-tuji-current" />
              {mt(lang, "hero.badge")}
            </div>
            <h1 className="mt-6 max-w-2xl font-display text-5xl font-extrabold leading-[1.08] tracking-tight text-tuji-ink sm:text-6xl">
              {mt(lang, "hero.title1")}
              <br />
              {mt(lang, "hero.title2")}
              <span className="text-tuji-brand">{mt(lang, "hero.accent")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-tuji-ink2">
              {mt(lang, "hero.subhead")}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/download"
                className="tuji-press inline-flex items-center justify-center gap-2 bg-tuji-current px-7 py-4 text-lg font-extrabold text-tuji-ink"
              >
                {mt(lang, "cta.download")}
              </Link>
            </div>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-px bg-tuji-rule">
              {heroStats.map((stat) => (
                <div key={stat.lKey} className="bg-tuji-paper2 p-4">
                  <div className="font-display text-2xl font-extrabold text-tuji-ink">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-[13px] text-tuji-ink3">{mt(lang, stat.lKey)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 拍照轉單字卡展示 */}
          <div className="relative mx-auto w-full max-w-2xl lg:mr-0">
            <div className="relative bg-tuji-paper2 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={HERO_CAPTURE_IMAGE}
                alt={mt(lang, "hero.imgAlt")}
                className="aspect-[16/9] w-full object-cover object-center"
                decoding="async"
              />
              <div className="absolute left-4 top-4 hidden items-center gap-2 bg-tuji-paper px-3.5 py-2 text-[13px] font-bold text-tuji-ink sm:flex">
                <span className="h-2 w-2 rounded-full bg-tuji-current" />
                {mt(lang, "hero.aiBadge")}
              </div>
            </div>

            {/* Two blocks butted straight against the image — no float, no
                rotation, no shadow. Depth here is the ink block itself. */}
            <div className="flex flex-col sm:flex-row">
              <div className="flex-1 bg-tuji-ink p-4 text-tuji-paper">
                <div className="text-[13px] font-bold uppercase tracking-[0.04em] text-tuji-paper/60">
                  {mt(lang, "hero.floatLabel")}
                </div>
                <div className="mt-0.5 font-display text-lg font-extrabold leading-tight">
                  mug · apple · notebook
                </div>
              </div>
              <div className="flex items-center bg-tuji-current px-4 py-3 text-sm font-extrabold text-tuji-ink">
                {mt(lang, "hero.floatTag")}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 單字牆跑馬燈 ─────────────────────────────────────── */}
      <section className="space-y-3 pb-16">
        <MarqueeRow items={marqueeRowA} lang={lang} />
        <MarqueeRow items={marqueeRowB} lang={lang} reverse />
      </section>

      {/* ── 怎麼學 ───────────────────────────────────────────── */}
      <section id="how" className="scroll-mt-20 bg-tuji-paper2 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <div className="text-[13px] font-bold uppercase tracking-[0.04em] text-tuji-ink3">
              {mt(lang, "how.eyebrow")}
            </div>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-tuji-ink sm:text-4xl">
              {mt(lang, "how.title")}
            </h2>
            <p className="mt-4 text-base leading-7 text-tuji-ink2">{mt(lang, "how.subtitle")}</p>
          </div>
          {/* gap-px on a rule-coloured grid: the separators ARE the 1px line,
              so three blocks read as one object instead of three cards. */}
          <div className="mt-10 grid gap-px bg-tuji-rule md:grid-cols-3">
            {howSteps.map((item) => (
              <div key={item.step} className="relative overflow-hidden bg-tuji-paper p-7">
                <div className="flex items-center justify-between">
                  <div className="font-display text-5xl font-extrabold text-tuji-ink">
                    {item.step}
                  </div>
                  <Mascot pose={item.pose} size={56} />
                </div>
                <h3 className="mt-5 text-lg font-bold tracking-tight text-tuji-ink">
                  {mt(lang, item.tKey)}
                </h3>
                <p className="mt-3 text-sm leading-6 text-tuji-ink2">{mt(lang, item.bKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 產品特色 ─────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-20 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <div className="text-[13px] font-bold uppercase tracking-[0.04em] text-tuji-ink3">
              {mt(lang, "feat.eyebrow")}
            </div>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-tuji-ink sm:text-4xl">
              {mt(lang, "feat.title")}
            </h2>
            <p className="mt-4 text-base leading-7 text-tuji-ink2">{mt(lang, "feat.subtitle")}</p>
          </div>
          <div className="mt-10 grid gap-px bg-tuji-rule sm:grid-cols-2 lg:grid-cols-3">
            {features.map((item) => (
              <div key={item.tKey} className="bg-tuji-paper p-7">
                <div className="flex h-12 w-12 items-center justify-center bg-tuji-paper2 text-2xl">
                  {item.icon}
                </div>
                <h3 className="mt-5 text-lg font-bold tracking-tight text-tuji-ink">
                  {mt(lang, item.tKey)}
                </h3>
                <p className="mt-2.5 text-sm leading-6 text-tuji-ink2">{mt(lang, item.bKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 自製圖鑑 ─────────────────────────────────────────── */}
      <section id="atlas" className="scroll-mt-20 pb-16 lg:pb-20">
        <div className="mx-auto max-w-6xl px-6">
          {/* Cocoa is the app icon's own ground — the supporting brand surface.
              It replaces the teal block: teal now means 積累 (mastery) only,
              and a marketing page has nobody's mastery to show. */}
          <div className="bg-tuji-cocoa">
            <div className="grid items-center gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:p-14">
              <div className="text-tuji-paper">
                <div className="inline-flex items-center gap-2 border-l-3 border-tuji-current bg-tuji-ink/20 py-1.5 pl-3 pr-3.5 text-[13px] font-bold tracking-[0.04em]">
                  {mt(lang, "atlas.badge")}
                </div>
                <h2 className="mt-5 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                  {mt(lang, "atlas.title1")}
                  <br />
                  {mt(lang, "atlas.title2")}
                </h2>
                <p className="mt-5 max-w-md text-base leading-7 text-tuji-paper/85">
                  {mt(lang, "atlas.body")}
                </p>
                {/* Real gaps, not the gap-px hairline trick: this row wraps,
                    and a wrapper background would show through the leftover
                    space on the last line. An unselected chip is a change of
                    ground, which needs no wrapper. */}
                <div className="mt-7 flex flex-wrap gap-2">
                  {atlasTagKeys.map((tagKey) => (
                    <span
                      key={tagKey}
                      className="bg-tuji-ink/20 px-3.5 py-1.5 text-sm font-bold text-tuji-paper"
                    >
                      {mt(lang, tagKey)}
                    </span>
                  ))}
                </div>
                <div className="mt-8 hidden lg:block">
                  <Mascot pose="think" size={104} />
                </div>
              </div>
              <div className="grid gap-px bg-tuji-paper/20 sm:grid-cols-2">
                {atlasSteps.map((item) => (
                  <div key={item.step} className="bg-tuji-paper p-6">
                    <div className="flex h-9 w-9 items-center justify-center bg-tuji-current font-display text-base font-extrabold text-tuji-ink">
                      {item.step}
                    </div>
                    <h3 className="mt-4 text-lg font-bold tracking-tight text-tuji-ink">
                      {mt(lang, item.tKey)}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-tuji-ink2">{mt(lang, item.bKey)}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Free/Pro quotas, no prices: App Store pricing is per-region. */}
            <div className="px-6 pb-6 sm:px-10 sm:pb-10 lg:px-14 lg:pb-12">
              <p className="border-t border-tuji-paper/20 pt-6 text-sm leading-6 text-tuji-paper/75">
                {mt(lang, "atlas.proNote")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 物見 ─────────────────────────────────────────────── */}
      <section id="community" className="scroll-mt-20 pb-16 lg:pb-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="bg-tuji-paper2 p-6 sm:p-10 lg:p-14">
            <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
              <div>
                <div className="inline-flex items-center gap-2 border-l-3 border-tuji-current bg-tuji-paper py-1.5 pl-3 pr-3.5 text-[13px] font-bold tracking-[0.04em] text-tuji-ink2">
                  {mt(lang, "comm.badge")}
                </div>
                <h2 className="mt-5 font-display text-3xl font-extrabold tracking-tight text-tuji-ink sm:text-4xl">
                  {mt(lang, "comm.title1")}
                  <br />
                  {mt(lang, "comm.title2")}
                </h2>
                <p className="mt-5 max-w-md text-base leading-7 text-tuji-ink2">
                  {mt(lang, "comm.body")}
                </p>
                <div className="mt-8 hidden lg:block">
                  <Mascot pose="peek" size={104} />
                </div>
              </div>
              <div className="grid gap-px bg-tuji-rule sm:grid-cols-2">
                {commSteps.map((item) => (
                  <div key={item.step} className="bg-tuji-paper p-6">
                    <div className="flex h-9 w-9 items-center justify-center bg-tuji-ink font-display text-base font-extrabold text-tuji-paper">
                      {item.step}
                    </div>
                    <h3 className="mt-4 text-lg font-bold tracking-tight text-tuji-ink">
                      {mt(lang, item.tKey)}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-tuji-ink2">{mt(lang, item.bKey)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 下載 ─────────────────────────────────────────────── */}
      <section id="download" className="scroll-mt-20 bg-tuji-ink py-16 lg:py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={APP_ICON_SRC} alt="Tuji app icon" className="h-full w-full object-cover" />
          </div>
          <h2 className="mt-7 font-display text-3xl font-extrabold tracking-tight text-tuji-paper sm:text-5xl">
            {mt(lang, "dl.title")}
            <span className="text-tuji-brand">{mt(lang, "dl.accent")}</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-tuji-paper/80">
            {mt(lang, "dl.subhead")}
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {/* The one primary action on the page, so it is the one thing
                wearing 瞳黃. Ink text on yellow — never white (≈11:1). */}
            <a
              href="/download"
              className="tuji-press inline-flex items-center gap-3 bg-tuji-current px-7 py-4 text-tuji-ink"
            >
              <AppleLogo className="h-8 w-8" />
              <span className="text-left">
                <span className="block text-[13px] font-bold text-tuji-ink/70">
                  Download on the
                </span>
                <span className="block font-display text-lg font-extrabold leading-tight">
                  App Store
                </span>
              </span>
            </a>
            {/* Secondary action on an ink ground: a lighter ground, not an
                outline. A resting element carries no border in this system. */}
            <Link
              href="/support"
              className="inline-flex items-center justify-center bg-tuji-paper/10 px-7 py-4 text-base font-bold text-tuji-paper transition duration-120 hover:bg-tuji-paper hover:text-tuji-ink"
            >
              {mt(lang, "dl.contact")}
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
