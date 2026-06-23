import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";

const ISSUE_TYPES = new Set(["image", "content", "audio", "answer", "ui", "other"]);
const MODES = new Set(["new", "review"]);
const PLATFORMS = new Set(["web", "ios"]);
const LANGS = new Set(["zh-Hant", "zh-Hans", "ja"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ReportBody {
  requestId?: string;
  wordId?: string;
  cardId?: number;
  issueType?: string;
  description?: string;
  mode?: string;
  phase?: string;
  selectedAnswer?: string | null;
  platform?: string;
  appVersion?: string | null;
  uiLang?: string;
  snapshot?: unknown;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function sanitizeSnapshot(value: unknown): Record<string, string | string[] | null> {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const out: Record<string, string | string[] | null> = {};
  const stringFields: Record<string, number> = {
    word: 200,
    chinese: 500,
    imageUrl: 2000,
    pronunciation: 300,
    category: 100,
    cardType: 100,
    deckKey: 100,
    front: 2000,
    back: 1000,
    explanation: 3000,
    displayedSpelling: 300,
  };
  for (const [key, max] of Object.entries(stringFields)) {
    const raw = source[key];
    out[key] = raw == null ? null : text(raw, max);
  }
  for (const key of ["choices", "spellingChoices"]) {
    const raw = source[key];
    out[key] = Array.isArray(raw)
      ? raw.slice(0, 12).map((item) => text(item, 300)).filter((item): item is string => Boolean(item))
      : [];
  }
  return out;
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  let body: ReportBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const requestId = text(body.requestId, 36);
  const wordId = text(body.wordId, 200);
  const issueType = text(body.issueType, 30);
  const description = text(body.description, 1000);
  const mode = text(body.mode, 20);
  const phase = text(body.phase, 80);
  const platform = text(body.platform, 20);
  const uiLang = text(body.uiLang, 20);
  const cardId = Number(body.cardId);

  if (
    !requestId || !UUID_RE.test(requestId) ||
    !wordId ||
    !issueType || !ISSUE_TYPES.has(issueType) ||
    !description ||
    !mode || !MODES.has(mode) ||
    !phase ||
    !platform || !PLATFORMS.has(platform) ||
    !uiLang || !LANGS.has(uiLang) ||
    !Number.isSafeInteger(cardId) || cardId <= 0
  ) {
    return NextResponse.json({ error: "invalid report" }, { status: 400 });
  }

  const selectedAnswer =
    body.selectedAnswer == null ? null : text(body.selectedAnswer, 500);
  const appVersion = body.appVersion == null ? null : text(body.appVersion, 100);
  const snapshot = sanitizeSnapshot(body.snapshot);

  try {
    const valid = await sql`
      SELECT 1
      FROM cards
      WHERE id = ${cardId} AND word_id = ${wordId}
      LIMIT 1
    `;
    if (valid.length === 0) {
      return NextResponse.json({ error: "invalid card" }, { status: 400 });
    }

    const inserted = await sql`
      INSERT INTO study_reports (
        request_id, user_id, word_id, card_id, issue_type, description,
        mode, phase, selected_answer, platform, app_version, ui_lang, snapshot
      )
      VALUES (
        ${requestId}::uuid, ${userId}::uuid, ${wordId}, ${cardId},
        ${issueType}, ${description}, ${mode}, ${phase}, ${selectedAnswer},
        ${platform}, ${appVersion}, ${uiLang}, ${sql.json(JSON.parse(JSON.stringify(snapshot)))}
      )
      ON CONFLICT (request_id) DO NOTHING
      RETURNING id, status
    `;
    if (inserted.length > 0) {
      return NextResponse.json({ ok: true, report: inserted[0] });
    }
    const existing = await sql`
      SELECT id, status
      FROM study_reports
      WHERE request_id = ${requestId}::uuid AND user_id = ${userId}::uuid
      LIMIT 1
    `;
    if (existing.length === 0) {
      return NextResponse.json({ error: "request id conflict" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, report: existing[0] });
  } catch (error) {
    console.error("[study/reports] insert failed", error);
    return NextResponse.json({ error: "submit failed" }, { status: 500 });
  }
}
