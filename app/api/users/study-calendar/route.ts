import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSettings, getStudyDaysInMonth, getStudyStreak } from "@/lib/users-db";
import { targetLanguageFor } from "@/lib/settings";
import { readLearningDirection } from "@/lib/cache-headers";
import { calendarMonth, monthRange } from "@/lib/study-calendar";
import { localDay, readTimezone } from "@/lib/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Check-in calendar: which days of one month had a word-card answer, plus the
// streak for the hero. Same zone and direction rules as /api/users/progress (a
// filled day is exactly a day the streak counted), and the same zone the
// check-in reward uses — all of them read it from the request (lib/timezone.ts).

export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tz = readTimezone(req);
  const today = localDay(new Date(), tz);
  const month = calendarMonth(new URL(req.url).searchParams.get("month"), today);
  if (!month) return NextResponse.json({ error: "invalid_month" }, { status: 400 });
  const settings = await getSettings(userId);
  const targetLanguage = targetLanguageFor(readLearningDirection(req, settings.learningDirection));
  const [studiedDays, streak] = await Promise.all([
    getStudyDaysInMonth(userId, tz, targetLanguage, monthRange(month)),
    getStudyStreak(userId, tz, targetLanguage),
  ]);
  return NextResponse.json(
    { month, timezone: tz, today, studiedDays, streak },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
