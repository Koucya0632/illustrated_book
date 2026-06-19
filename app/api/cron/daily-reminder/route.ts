// Daily study reminder fan-out.
//
// Runs every 15 min (vercel.json -> /api/cron/daily-reminder, "*/15 * * * *").
// Each user picks their own reminder time (user_settings.reminder_hour /
// reminder_minute, in 15-min steps) and can switch it off
// (reminder_enabled). Because each device reports its own IANA timezone, that
// local time lands at a different UTC moment per user — so we run every 15
// minutes and, each run, pick the users for whom it is *currently* their
// chosen reminder time (bucketed to 15 min) in their timezone, who have not
// studied yet today (local date), and who have not already been reminded
// today. Those get one APNs push: "今天還沒學…".
//
// Auth: Vercel Cron sends Authorization: Bearer ${CRON_SECRET}. Without the
// env var the endpoint refuses to run, so a public probe can't trigger sends.
//
// Idempotency: a (user_id, local_date) row is written to user_daily_reminders
// only after a successful send, so re-running the same hour is a no-op and a
// user is never double-reminded for the same day.

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { apnsConfigFromEnv, sendApns } from "@/lib/apns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TITLE = "今天還沒學";
const BODY = "花兩分鐘練幾張，別讓今天空白 📚";

interface Candidate {
  user_id: string;
  token: string;
  timezone: string;
  local_date: string; // YYYY-MM-DD in the user's timezone
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cfg = apnsConfigFromEnv();
  if (!cfg) {
    return NextResponse.json(
      { error: "APNs not configured (APNS_KEY_ID/APNS_TEAM_ID/APNS_PRIVATE_KEY)" },
      { status: 503 },
    );
  }

  const sql = getSql();
  if (!sql) {
    return NextResponse.json(
      { error: "DATABASE_URL not configured" },
      { status: 503 },
    );
  }

  const startedAt = Date.now();

  // One candidate per user: their most-recently-updated iOS device's token +
  // timezone, gated to: reminders enabled, "it is currently the user's chosen
  // reminder hour and 15-min minute-bucket locally", "no study_logs since
  // local midnight", and "not already reminded this local date".
  //
  // `now() AT TIME ZONE tz` converts the current instant to that zone's
  // wall-clock (a naive timestamp); date_trunc('day', …) gives local midnight,
  // and re-applying `AT TIME ZONE tz` converts it back to an instant we can
  // compare against study_logs.created_at (timestamptz).
  //
  // Settings come from user_settings via LEFT JOIN; users with no row fall
  // back to the defaults (enabled, 20:00) through COALESCE.
  let candidates: Candidate[];
  try {
    candidates = (await sql`
      WITH latest AS (
        SELECT DISTINCT ON (user_id)
               user_id, token, timezone, updated_at
        FROM user_push_tokens
        WHERE platform = 'ios'
        ORDER BY user_id, updated_at DESC
      )
      SELECT l.user_id,
             l.token,
             l.timezone,
             to_char((now() AT TIME ZONE l.timezone)::date, 'YYYY-MM-DD') AS local_date
      FROM latest l
      LEFT JOIN user_settings st ON st.user_id = l.user_id
      WHERE COALESCE(st.reminder_enabled, true) = true
        AND extract(hour FROM (now() AT TIME ZONE l.timezone))::int
            = COALESCE(st.reminder_hour, 20)
        AND (floor(extract(minute FROM (now() AT TIME ZONE l.timezone))::int / 15) * 15)
            = COALESCE(st.reminder_minute, 0)
        AND NOT EXISTS (
          SELECT 1 FROM study_logs s
          WHERE s.user_id = l.user_id
            AND s.created_at >=
                (date_trunc('day', now() AT TIME ZONE l.timezone)
                   AT TIME ZONE l.timezone)
        )
        AND NOT EXISTS (
          SELECT 1 FROM user_daily_reminders d
          WHERE d.user_id = l.user_id
            AND d.reminded_on = (now() AT TIME ZONE l.timezone)::date
        )
    `) as unknown as Candidate[];
  } catch (err) {
    console.error("[cron/daily-reminder] candidate query failed", err);
    return NextResponse.json(
      { error: "query failed", message: String(err) },
      { status: 500 },
    );
  }

  let sent = 0;
  let failed = 0;
  let pruned = 0;

  for (const c of candidates) {
    const result = await sendApns(cfg, c.token, { title: TITLE, body: BODY });

    if (result.ok) {
      sent++;
      // Claim the day AFTER a successful send so transient failures can retry
      // on a later (same-hour) invocation rather than silently skipping.
      try {
        await sql`
          INSERT INTO user_daily_reminders (user_id, reminded_on)
          VALUES (${c.user_id}, ${c.local_date}::date)
          ON CONFLICT (user_id, reminded_on) DO NOTHING
        `;
      } catch (err) {
        console.error("[cron/daily-reminder] dedupe insert failed", err);
      }
    } else {
      failed++;
      if (result.dead) {
        // APNs says this token is permanently invalid — drop it so we stop
        // trying. Matched by exact token value (a user may have other devices).
        try {
          await sql`DELETE FROM user_push_tokens WHERE token = ${c.token}`;
          pruned++;
        } catch (err) {
          console.error("[cron/daily-reminder] dead-token prune failed", err);
        }
      } else {
        console.warn(
          `[cron/daily-reminder] send failed user=${c.user_id} status=${result.status} reason=${result.reason}`,
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    candidates: candidates.length,
    sent,
    failed,
    prunedDeadTokens: pruned,
  });
}
