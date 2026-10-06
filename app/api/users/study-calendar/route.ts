import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSettings, getStudyDaysInMonth, getStudyStreak } from "@/lib/users-db";
import { targetLanguageFor } from "@/lib/settings";
import { readLearningDirection } from "@/lib/cache-headers";
import { calendarMonth, localDay, monthRange } from "@/lib/study-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Check-in calendar: which days of one month had a word-card answer, plus the
// streak for the hero. Same timezone and direction rules as /api/users/progress
// (a filled day is exactly a day the streak counted), and the same zone the
// check-in reward uses (lib/credits/policy.ts CHECK_IN_TIMEZONE).
const TZ = "Asia/Taipei";

export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const today = localDay(new Date(), TZ);
  const month = calendarMonth(new URL(req.url).searchParams.get("month"), today);
  if (!month) return NextResponse.json({ error: "invalid_month" }, { status: 400 });
  const settings = await getSettings(userId);
  const targetLanguage = targetLanguageFor(readLearningDirection(req, settings.learningDirection));
  const [studiedDays, streak] = await Promise.all([
    getStudyDaysInMonth(userId, TZ, targetLanguage, monthRange(month)),
    getStudyStreak(userId, TZ, targetLanguage),
  ]);
  return NextResponse.json(
    { month, timezone: TZ, today, studiedDays, streak },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
