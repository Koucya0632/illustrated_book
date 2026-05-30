// OpenCC zh-Hant → zh-Hans converter (lazy-init singleton).
//
// We use the character-level Taiwan-style → Simplified mapping (`tw` → `cn`).
// Phrase-level conversion (e.g. 程式 → 程序, 軟體 → 软件) is NOT applied;
// opencc-js doesn't ship those tables. For an everyday-life picture
// dictionary this is fine — the vocabulary is 廚房 / 客廳 / 冰箱-tier, not
// software jargon — and the converted strings stay readable to mainland
// users.
//
// Pure JS, runs on both server and client. Pages that only need server-side
// conversion can import this directly; client paths should dynamic-import to
// keep the default bundle slim (the OpenCC tables are ~200KB+).

import { Converter } from "opencc-js";

type ConvertFn = (s: string) => string;

let _toHans: ConvertFn | null = null;

function getToHans(): ConvertFn {
  if (!_toHans) {
    _toHans = Converter({ from: "tw", to: "cn" }) as ConvertFn;
  }
  return _toHans;
}

export function toZhHans(text: string): string {
  if (!text) return text;
  return getToHans()(text);
}
