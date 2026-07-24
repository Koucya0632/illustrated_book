// Server-only resolver for the PUBLIC marketing surface's UI language.
//
// Anonymous visitors have no account to persist to, so the landing-page switcher
// stores the choice in a cookie (`tuji_lang`). On first visit (no cookie) we make
// a best-effort guess from Accept-Language so a Japanese/English visitor lands in
// their language. Everything is clamped to the four supported UI languages.
//
// Reads cookies()/headers() → opts the caller into dynamic rendering. The whole
// app tree is already dynamic (root layout reads the session), so this is free.
import { cookies, headers } from "next/headers";
import { normalizeUiLang, type UiLang } from "./settings";
import { PUBLIC_LANG_COOKIE } from "./marketing-i18n";

/** Map the first Accept-Language tag to a supported UI language (default zh-Hant). */
function fromAcceptLanguage(header: string | null): UiLang {
  const first = (header ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (first.startsWith("ja")) return "ja";
  if (first.startsWith("en")) return "en";
  // Simplified Chinese locales; everything else (incl. zh-TW/zh-HK) → Traditional.
  if (first === "zh-hans" || first === "zh-cn" || first === "zh-sg" || first.startsWith("zh-hans"))
    return "zh-Hans";
  return "zh-Hant";
}

/** Resolve the marketing UI language: cookie first, then Accept-Language, else zh-Hant. */
export function getPublicLang(): UiLang {
  const cookie = cookies().get(PUBLIC_LANG_COOKIE)?.value;
  if (cookie) return normalizeUiLang(cookie);
  return fromAcceptLanguage(headers().get("accept-language"));
}
