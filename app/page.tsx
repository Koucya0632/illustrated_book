import type { Metadata } from "next";
import Link from "next/link";
import Mascot from "@/components/tuji/Mascot";
import PublicShell from "@/components/marketing/PublicShell";

export const metadata: Metadata = {
  title: "Tuji · 圖鑑式單字學習",
  description:
    "看得見的單字，記得住的語言。Tuji 用日常生活的圖片、間隔複習與 AI 自製圖鑑，幫中文使用者學會生活英文和日文。",
};

// App Store 上架後填入正式連結，下載區的按鈕會自動變成可點擊的徽章。
const APP_STORE_URL: string | null = null;

const APP_ICON_SRC = "/brand/tuji-app-icon.png";
const HERO_CAPTURE_IMAGE = "/marketing/atlas-capture-cards.webp";

const marqueeRowA = [
  { src: "/word-images/alarm-clock.png", en: "alarm clock", zh: "鬧鐘" },
  { src: "/word-images/headphones.png", en: "headphones", zh: "耳機" },
  { src: "/word-images/rice-cooker.png", en: "rice cooker", zh: "電鍋" },
  { src: "/word-images/bicycle.png", en: "bicycle", zh: "腳踏車" },
  { src: "/word-images/mug.png", en: "mug", zh: "馬克杯" },
  { src: "/word-images/vending-machine.png", en: "vending machine", zh: "販賣機" },
  { src: "/word-images/scissors.png", en: "scissors", zh: "剪刀" },
  { src: "/word-images/toaster.png", en: "toaster", zh: "烤麵包機" },
];

const marqueeRowB = [
  { src: "/word-images/convenience-store.png", en: "convenience store", zh: "便利商店" },
  { src: "/word-images/subway.png", en: "subway", zh: "捷運" },
  { src: "/word-images/frying-pan.png", en: "frying pan", zh: "平底鍋" },
  { src: "/word-images/towel.png", en: "towel", zh: "毛巾" },
  { src: "/word-images/bookshelf.png", en: "bookshelf", zh: "書櫃" },
  { src: "/word-images/taxi.png", en: "taxi", zh: "計程車" },
  { src: "/word-images/kettle.png", en: "kettle", zh: "熱水壺" },
  { src: "/word-images/shopping-cart.png", en: "shopping cart", zh: "購物車" },
];

const howSteps = [
  {
    step: "01",
    title: "打開 App，領取今日單字",
    body: "每天一份剛剛好的學習量。單字來自你選的生活分類——廚房、車站、超市，都是你真的會遇到的東西。",
    pose: "face" as const,
  },
  {
    step: "02",
    title: "看圖記憶，一次記牢",
    body: "每個單字都有圖片、發音與例句。用眼睛建立連結，比死背單字表記得更久。",
    pose: "think" as const,
  },
  {
    step: "03",
    title: "到期自動複習",
    body: "間隔重複演算法在你快忘記之前安排複習。你只要出現，Tuji 負責記得該複習什麼。",
    pose: "cheer" as const,
  },
];

const features = [
  {
    icon: "🖼️",
    title: "圖像優先記憶",
    body: "從真實生活物品學單字，不是抽象的單字列表。看見圖片，想起單字。",
  },
  {
    icon: "⏰",
    title: "間隔重複複習",
    body: "科學化的複習排程，在遺忘曲線的關鍵點提醒你，讓短期記憶變成長期記憶。",
  },
  {
    icon: "✏️",
    title: "多種練習模式",
    body: "認圖、辨識、拼寫輪流上陣，同一個單字用不同角度練習，記憶更立體。",
  },
  {
    icon: "🔊",
    title: "發音與例句",
    body: "每個單字都能聽發音、看例句，學會怎麼念、怎麼用，而不只是認得。",
  },
  {
    icon: "🌏",
    title: "英文・日文",
    body: "同一套圖鑑，支援英文與日文兩種學習目標，隨時切換學習方向。",
  },
  {
    icon: "📈",
    title: "進度看得見",
    body: "每個單字的熟練度、每天的學習紀錄一目瞭然，累積的努力不會消失。",
  },
];

const atlasSteps = [
  { step: "1", title: "拍下照片", body: "廚房的鍋子、巷口的招牌，拍下你想學的東西。" },
  { step: "2", title: "AI 辨識物品", body: "AI 自動辨認照片裡的物品，並給出對應的單字。" },
  { step: "3", title: "確認與修正", body: "AI 猜錯了？直接改。你永遠有最後決定權。" },
  { step: "4", title: "變成單字卡", body: "照片進入你的專屬圖鑑，加入每天的學習與複習。" },
];

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 814 1000" aria-hidden="true" className={className} fill="currentColor">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  );
}

function MarqueeCard({ item }: { item: { src: string; en: string; zh: string } }) {
  return (
    <div className="flex w-44 shrink-0 items-center gap-3 rounded-2xl bg-white p-2.5 shadow-soft">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.src}
        alt=""
        loading="lazy"
        className="h-12 w-12 shrink-0 rounded-xl object-cover"
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-extrabold text-tuji-ink">{item.en}</div>
        <div className="text-xs font-bold text-tuji-ink3">{item.zh}</div>
      </div>
    </div>
  );
}

function MarqueeRow({
  items,
  reverse,
}: {
  items: { src: string; en: string; zh: string }[];
  reverse?: boolean;
}) {
  const track = [...items, ...items];
  return (
    <div className="overflow-hidden" aria-hidden="true">
      <div className={`flex w-max gap-3 ${reverse ? "tuji-marquee-reverse" : "tuji-marquee"}`}>
        {track.map((item, index) => (
          <MarqueeCard key={`${item.en}-${index}`} item={item} />
        ))}
      </div>
    </div>
  );
}

export default function MarketingHomePage() {
  return (
    <PublicShell>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-12 sm:px-7 lg:grid-cols-[0.94fr_1.06fr] lg:pb-24 lg:pt-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-tuji-tealS px-3.5 py-1.5 text-xs font-extrabold tracking-wide text-tuji-teal">
              <span className="h-2 w-2 rounded-full bg-tuji-teal" />
              圖鑑式單字學習 · Picture-first
            </div>
            <h1 className="mt-6 max-w-2xl font-display text-5xl font-extrabold leading-[1.08] tracking-tight text-tuji-ink sm:text-6xl">
              看見什麼，
              <br />
              就學什麼<span className="text-tuji-coral">。</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg font-semibold leading-8 text-tuji-ink2">
              Tuji 把日常生活變成你的單字圖鑑——圖片記憶、真人發音、間隔複習，
              再加上 AI 幫你把自己拍的照片變成單字卡。學英文和日文，從你眼前的世界開始。
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/#download"
                className="tuji-press inline-flex items-center justify-center gap-2 rounded-2xl bg-tuji-yellow px-7 py-4 text-base font-extrabold text-tuji-ink"
                style={{ ["--press-shadow" as string]: "#d7a900" }}
              >
                搶先體驗 iOS App
              </Link>
            </div>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
              {[
                { value: "500+", label: "生活單字" },
                { value: "EN·JA", label: "雙語言學習" },
                { value: "AI", label: "圖鑑辨識" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl bg-white p-4 shadow-soft">
                  <div className="text-2xl font-extrabold text-tuji-ink">{stat.value}</div>
                  <div className="mt-1 text-xs font-bold text-tuji-ink3">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 拍照轉單字卡展示 */}
          <div className="relative mx-auto w-full max-w-2xl pb-9 sm:pb-0 lg:mr-0">
            <div className="relative overflow-hidden rounded-[34px] bg-white p-2 shadow-card ring-1 ring-tuji-ink/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={HERO_CAPTURE_IMAGE}
                alt="用手機拍攝桌上的物品，Tuji 將馬克杯、蘋果與筆記本轉成學習卡片"
                className="aspect-[16/9] w-full rounded-[28px] object-cover object-center"
                decoding="async"
              />
              <div className="absolute left-4 top-4 hidden items-center gap-2 rounded-full bg-white/90 px-3.5 py-2 text-xs font-extrabold text-tuji-ink shadow-soft backdrop-blur sm:flex">
                <span className="h-2 w-2 rounded-full bg-tuji-teal" />
                AI 圖鑑辨識中
              </div>
            </div>

            <div className="tuji-float relative mx-3 -mt-6 flex items-center gap-3 rounded-2xl bg-tuji-ink p-4 text-white shadow-card sm:absolute sm:-bottom-6 sm:left-8 sm:mx-0 sm:mt-0 sm:w-max sm:pr-6">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/60">
                  拍照學習
                </div>
                <div className="text-lg font-extrabold leading-tight">mug · apple · notebook</div>
              </div>
            </div>

            <div className="tuji-float-delayed absolute -right-1 -top-4 rotate-2 rounded-2xl bg-tuji-coral px-4 py-2.5 text-sm font-extrabold text-white shadow-card sm:-right-3 sm:-top-5">
              新增單字卡 3 張 ✓
            </div>
          </div>
        </div>
      </section>

      {/* ── 單字牆跑馬燈 ─────────────────────────────────────── */}
      <section className="space-y-3 pb-16">
        <MarqueeRow items={marqueeRowA} />
        <MarqueeRow items={marqueeRowB} reverse />
      </section>

      {/* ── 怎麼學 ───────────────────────────────────────────── */}
      <section id="how" className="scroll-mt-20 bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-7">
          <div className="max-w-2xl">
            <div className="text-sm font-extrabold uppercase tracking-[0.16em] text-tuji-teal">
              How it works
            </div>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-tuji-ink sm:text-4xl">
              每天幾分鐘，讓複習自己找上門。
            </h2>
            <p className="mt-4 text-base font-semibold leading-7 text-tuji-ink2">
              Tuji 的流程刻意保持簡單：打開、學習、離開。剩下的排程交給演算法。
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {howSteps.map((item) => (
              <div
                key={item.step}
                className="relative overflow-hidden rounded-[28px] bg-tuji-bg p-7"
              >
                <div className="flex items-center justify-between">
                  <div className="font-display text-5xl font-extrabold text-tuji-yellow">
                    {item.step}
                  </div>
                  <Mascot pose={item.pose} size={56} />
                </div>
                <h3 className="mt-5 text-xl font-extrabold tracking-tight text-tuji-ink">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm font-semibold leading-6 text-tuji-ink2">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 產品特色 ─────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-20 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-7">
          <div className="max-w-2xl">
            <div className="text-sm font-extrabold uppercase tracking-[0.16em] text-tuji-teal">
              Features
            </div>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-tuji-ink sm:text-4xl">
              為了「每天都想打開」而設計。
            </h2>
            <p className="mt-4 text-base font-semibold leading-7 text-tuji-ink2">
              從拍下真實物品、生成單字卡，到安排複習，Tuji 把學習流程做得像整理照片一樣自然。
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((item) => (
              <div
                key={item.title}
                className="rounded-[28px] bg-white p-7 shadow-soft transition hover:shadow-card"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tuji-tealS text-2xl">
                  {item.icon}
                </div>
                <h3 className="mt-5 text-lg font-extrabold tracking-tight text-tuji-ink">
                  {item.title}
                </h3>
                <p className="mt-2.5 text-sm font-semibold leading-6 text-tuji-ink2">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 自製圖鑑 ─────────────────────────────────────────── */}
      <section id="atlas" className="scroll-mt-20 pb-16 lg:pb-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-7">
          <div className="overflow-hidden rounded-[36px] bg-tuji-teal">
            <div className="grid items-center gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:p-14">
              <div className="text-white">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-extrabold tracking-wide">
                  自製圖鑑 · Custom Atlas
                </div>
                <h2 className="mt-5 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                  拍下你的世界，
                  <br />
                  變成你的單字卡。
                </h2>
                <p className="mt-5 max-w-md text-base font-semibold leading-7 text-white/85">
                  課本不會教你家廚房裡的東西。用相機把身邊的物品收進圖鑑，AI
                  幫你辨識命名，一起加入每天的複習。照片預設私人，只有你決定要不要分享。
                </p>
                <div className="mt-7 flex flex-wrap gap-2">
                  {["預設私人", "AI 輔助辨識", "手動修正", "分享自主控制"].map((label) => (
                    <span
                      key={label}
                      className="rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-extrabold"
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <div className="mt-8 hidden lg:block">
                  <Mascot pose="think" size={104} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {atlasSteps.map((item) => (
                  <div key={item.step} className="rounded-[24px] bg-white p-6">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-tuji-yellow font-display text-base font-extrabold text-tuji-ink">
                      {item.step}
                    </div>
                    <h3 className="mt-4 text-lg font-extrabold tracking-tight text-tuji-ink">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-tuji-ink2">
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 下載 ─────────────────────────────────────────────── */}
      <section id="download" className="scroll-mt-20 bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-3xl px-5 text-center sm:px-7">
          <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-[32px] shadow-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={APP_ICON_SRC} alt="Tuji app icon" className="h-full w-full object-cover" />
          </div>
          <h2 className="mt-7 font-display text-3xl font-extrabold tracking-tight text-tuji-ink sm:text-5xl">
            Tuji 即將登陸 App Store<span className="text-tuji-coral">。</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base font-semibold leading-7 text-tuji-ink2">
            iOS 版正在進行最後準備。想第一時間收到上架消息，或搶先加入測試？歡迎寫信給我們。
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {APP_STORE_URL ? (
              <a
                href={APP_STORE_URL}
                className="tuji-press inline-flex items-center gap-3 rounded-2xl bg-tuji-ink px-7 py-4 text-white"
                style={{ ["--press-shadow" as string]: "#000000" }}
              >
                <AppleLogo className="h-8 w-8" />
                <span className="text-left">
                  <span className="block text-[11px] font-bold text-white/70">Download on the</span>
                  <span className="block text-lg font-extrabold leading-tight">App Store</span>
                </span>
              </a>
            ) : (
              <div className="inline-flex cursor-default items-center gap-3 rounded-2xl bg-tuji-ink/90 px-7 py-4 text-white">
                <AppleLogo className="h-8 w-8" />
                <span className="text-left">
                  <span className="block text-[11px] font-bold text-white/70">Coming soon to the</span>
                  <span className="block text-lg font-extrabold leading-tight">App Store</span>
                </span>
              </div>
            )}
            <Link
              href="/support"
              className="inline-flex items-center justify-center rounded-2xl bg-tuji-tealS px-7 py-4 text-base font-extrabold text-tuji-teal transition hover:bg-tuji-teal hover:text-white"
            >
              聯絡我們
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
