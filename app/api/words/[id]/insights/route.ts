// 詞條延伸內容 (容易混淆、常見誤用、用法補充) for one word, in the caller's UI
// language and learning direction.
//
// Its own route so the word detail stays edge-cached: only this small response
// depends on who is asking. Under membership policy v1 it answers
// `available: false` without touching the database.

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getMembershipAccess } from "@/lib/atlas/entitlement";
import { membershipPolicy } from "@/lib/atlas/membership";
import { readLang, readLearningDirection } from "@/lib/cache-headers";
import type { UiLang } from "@/lib/settings";
import { readStoredWordInsights } from "@/lib/word-insights";
import { presentWordInsights } from "@/lib/word-insights-present";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  if (membershipPolicy() !== "v2") {
    return NextResponse.json({ available: false, insights: null }, { headers });
  }
  const { id } = await props.params;
  const lang = readLang(req) as UiLang;
  const language = readLearningDirection(req) === "zh-ja" ? "ja" : "en";
  const [stored, userId] = await Promise.all([readStoredWordInsights(id, language), getCurrentUserId()]);
  const tier = userId ? (await getMembershipAccess(userId)).tier : "free";
  const hasMembership = tier === "lifetime" || tier === "pro";
  return NextResponse.json(
    { available: true, insights: stored ? presentWordInsights(stored, lang, hasMembership) : null },
    { headers },
  );
}
