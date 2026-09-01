export const ANALYTICS_EVENT_MAX_BODY_BYTES = 4_096;

const VALID_TYPES = new Set([
  "view", "favorite", "pronounce",
  "app_open", "study_start", "study_complete",
  "paywall_view", "share_app", "atlas_capture_open",
  "atlas_publish_submitted", "atlas_publish_withdrawn",
  "atlas_public_item_viewed", "atlas_public_saved",
  "author_profile_viewed",
]);
const VALID_PLATFORMS = new Set(["web", "ios", "android"]);

export interface AnalyticsEventInput {
  type: string;
  wordId: string | null;
  category: string | null;
  sessionId: string | null;
  platform: string;
}

export type AnalyticsEventParseResult =
  | { ok: true; value: AnalyticsEventInput }
  | { ok: false; error: string };

function optionalString(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string" || value.length > maxLength) {
    return { ok: false, error: `invalid ${field}` };
  }
  return { ok: true, value };
}

export function parseAnalyticsEvent(input: unknown): AnalyticsEventParseResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "invalid body" };
  }
  const body = input as Record<string, unknown>;
  if (typeof body.type !== "string" || !VALID_TYPES.has(body.type)) {
    return { ok: false, error: "invalid type" };
  }

  const wordId = optionalString(body.wordId, "wordId", 128);
  if (!wordId.ok) return wordId;
  const category = optionalString(body.category, "category", 64);
  if (!category.ok) return category;
  const sessionId = optionalString(body.sessionId, "sessionId", 128);
  if (!sessionId.ok) return sessionId;
  const platform = body.platform === undefined ? "web" : body.platform;
  if (typeof platform !== "string" || !VALID_PLATFORMS.has(platform)) {
    return { ok: false, error: "invalid platform" };
  }

  return {
    ok: true,
    value: {
      type: body.type,
      wordId: wordId.value,
      category: category.value,
      sessionId: sessionId.value,
      platform,
    },
  };
}
