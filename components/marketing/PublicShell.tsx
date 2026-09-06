import Link from "next/link";
import { getPublicLang } from "@/lib/public-lang";
import { mt } from "@/lib/marketing-i18n";
import LangSwitcher from "./LangSwitcher";

const APP_ICON_SRC = "/brand/tuji-app-icon.png";

const NAV = [
  { href: "/#features", key: "nav.features" },
  { href: "/#atlas", key: "nav.atlas" },
  { href: "/#community", key: "nav.community" },
  { href: "/#how", key: "nav.how" },
  { href: "/support", key: "nav.support" },
];

export default async function PublicShell({ children }: { children: React.ReactNode }) {
  const lang = await getPublicLang();
  return (
    <div className={`min-h-screen bg-tuji-paper text-tuji-ink${lang === "ja" ? " font-ja" : ""}`}>
      {/* One hairline, no shadow: the header is separated from the page by
          tuji-rule, which is the only line the system has. */}
      <header className="sticky top-0 z-50 border-b border-tuji-rule bg-tuji-paper">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={APP_ICON_SRC} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="font-display text-[22px] font-extrabold tracking-tight text-tuji-ink">
              {/* Identity, not state: the wordmark's period is the one place
                  brand yellow appears without meaning "here is the next step". */}
              Tuji<span className="text-tuji-brand">.</span>
            </span>
          </Link>
          {/* lg, not md: five items at English label widths (~460px) plus the
              logo, language switcher and CTA overflow a 768px header. Every
              target here is also in the footer, so hiding it costs no reach. */}
          <nav className="hidden items-center gap-6 text-sm font-bold text-tuji-ink2 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="transition duration-120 hover:text-tuji-ink"
              >
                {mt(lang, item.key)}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <LangSwitcher current={lang} />
            <Link
              href="/download"
              className="tuji-press bg-tuji-current px-4 py-2.5 text-sm font-extrabold text-tuji-ink"
            >
              {mt(lang, "cta.getApp")}
            </Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="bg-tuji-ink text-tuji-paper">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-10 sm:grid-cols-[1.2fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={APP_ICON_SRC} alt="" className="h-full w-full object-cover" />
                </span>
                <span className="font-display text-xl font-extrabold tracking-tight">
                  Tuji<span className="text-tuji-brand">.</span>
                </span>
              </div>
              <p className="mt-4 max-w-xs text-sm leading-6 text-tuji-paper/70">
                {mt(lang, "foot.tagline")}
              </p>
            </div>
            <div>
              <div className="text-[13px] font-bold uppercase tracking-[0.04em] text-tuji-paper/50">
                {mt(lang, "foot.product")}
              </div>
              <div className="mt-4 flex flex-col gap-3 text-sm font-bold text-tuji-paper/80">
                <Link href="/#features" className="transition duration-120 hover:text-tuji-brand">
                  {mt(lang, "nav.features")}
                </Link>
                <Link href="/#atlas" className="transition duration-120 hover:text-tuji-brand">
                  {mt(lang, "nav.atlas")}
                </Link>
                <Link href="/#community" className="transition duration-120 hover:text-tuji-brand">
                  {mt(lang, "nav.community")}
                </Link>
                <Link href="/download" className="transition duration-120 hover:text-tuji-brand">
                  {mt(lang, "foot.iosApp")}
                </Link>
              </div>
            </div>
            <div>
              <div className="text-[13px] font-bold uppercase tracking-[0.04em] text-tuji-paper/50">
                {mt(lang, "foot.supportLegal")}
              </div>
              <div className="mt-4 flex flex-col gap-3 text-sm font-bold text-tuji-paper/80">
                <Link href="/support" className="transition duration-120 hover:text-tuji-brand">
                  {mt(lang, "foot.supportCenter")}
                </Link>
                <Link href="/privacy" className="transition duration-120 hover:text-tuji-brand">
                  {mt(lang, "foot.privacy")}
                </Link>
                <Link href="/terms" className="transition duration-120 hover:text-tuji-brand">
                  {mt(lang, "foot.terms")}
                </Link>
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-2 border-t border-tuji-paper/15 pt-6 text-[13px] text-tuji-paper/50 sm:flex-row sm:items-center sm:justify-between">
            <p>Provided by Hong Kuok Wai · nexflow0632@gmail.com</p>
            <p>© {new Date().getFullYear()} Tuji</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
