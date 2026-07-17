import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";

const FEEDBACK_TYPES = new Set(["feature", "bug", "content", "other"]);
const PLATFORMS = new Set(["web", "ios"]);
const LANGS = new Set(["zh-Hant", "zh-Hans", "ja"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface FeedbackBody {
  requestId?: string;
  feedbackType?: string;
  description?: string;
  platform?: string;
  appVersion?: string | null;
  uiLang?: string;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  let body: FeedbackBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const requestId = text(body.requestId, 36);
  const feedbackType = text(body.feedbackType, 30);
  const description = text(body.description, 1000);
  const platform = text(body.platform, 20);
  const uiLang = text(body.uiLang, 20);

  if (
    !requestId || !UUID_RE.test(requestId) ||
    !feedbackType || !FEEDBACK_TYPES.has(feedbackType) ||
    !description ||
    !platform || !PLATFORMS.has(platform) ||
    !uiLang || !LANGS.has(uiLang)
  ) {
    return NextResponse.json({ error: "invalid feedback" }, { status: 400 });
  }

  const appVersion = body.appVersion == null ? null : text(body.appVersion, 100);

  try {
    const inserted = await sql`
      INSERT INTO feedback (
        request_id, user_id, feedback_type, description,
        platform, app_version, ui_lang
      )
      VALUES (
        ${requestId}::uuid, ${userId}::uuid, ${feedbackType}, ${description},
        ${platform}, ${appVersion}, ${uiLang}
      )
      ON CONFLICT (request_id) DO NOTHING
      RETURNING id, status
    `;
    if (inserted.length > 0) {
      return NextResponse.json({ ok: true, feedback: inserted[0] });
    }
    const existing = await sql`
      SELECT id, status
      FROM feedback
      WHERE request_id = ${requestId}::uuid AND user_id = ${userId}::uuid
      LIMIT 1
    `;
    if (existing.length === 0) {
      return NextResponse.json({ error: "request id conflict" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, feedback: existing[0] });
  } catch (error) {
    console.error("[users/feedback] insert failed", error);
    return NextResponse.json({ error: "submit failed" }, { status: 500 });
  }
}
