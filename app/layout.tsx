import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Noto_Sans_TC, Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import TujiShell from "@/components/tuji/Shell";
import { CategoriesProvider } from "@/components/CategoriesProvider";
import { UserProvider } from "@/components/UserProvider";
import { SettingsProvider } from "@/components/SettingsProvider";
import AppScale from "@/components/AppScale";
import HydrateUserState from "@/components/HydrateUserState";
import { getCategoriesFromDb } from "@/lib/categories-db";
import { getCurrentUserBundle } from "@/lib/current-user";
import { getSettings } from "@/lib/users-db";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { localeTag } from "@/lib/i18n";
import { getPublicLang } from "@/lib/public-lang";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});
const notoTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-tc",
  display: "swap",
});
const notoJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-jp",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tuji · 圖鑑式學英文",
  description:
    "看得見的英文，記得住的單字。透過圖片、分類、發音、例句與測驗，學會生活英文。",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const bundle = await getCurrentUserBundle();
  const settings = bundle ? await getSettings(bundle.user.id) : DEFAULT_SETTINGS;
  // The word catalogue is NOT fetched here. It used to be, and every page on
  // the site — including the public marketing page, which uses none of it —
  // shipped all 478 word objects in its HTML: ~295KB of a 376KB homepage, 78%
  // of the bytes. `useWords()` has exactly five consumers, so each of them now
  // provides it from its own layout. See app/cards/layout.tsx.
  const categories = await getCategoriesFromDb(settings.uiLang);
  // Logged-in users get their saved UI language; anonymous visitors (e.g. the
  // marketing page) get the cookie-based public language so <html lang> is
  // correct for SEO/screen-readers.
  const htmlLang = localeTag(bundle ? settings.uiLang : await getPublicLang());
  return (
    <html
      lang={htmlLang}
      className={`${jakarta.variable} ${notoTC.variable} ${notoJP.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen bg-tuji-bg text-tuji-ink">
          <CategoriesProvider categories={categories}>
          <UserProvider user={bundle?.user ?? null}>
            <SettingsProvider initial={settings} loggedIn={!!bundle}>
              <AppScale />
              {bundle && (
                <HydrateUserState
                  favorites={bundle.favorites}
                  learned={bundle.learned}
                />
              )}
              <TujiShell
                user={
                  bundle
                    ? {
                        username: bundle.user.username,
                        nickname: bundle.user.nickname,
                        avatar: bundle.user.avatar,
                        email: bundle.user.email,
                      }
                    : null
                }
              >
                {children}
              </TujiShell>
            </SettingsProvider>
          </UserProvider>
          </CategoriesProvider>
      </body>
    </html>
  );
}
