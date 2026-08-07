// Outbound moderation notifications.
//
// Auto-escalation already handles the urgent cases — 不當內容 and 侵犯版權 pull
// an item down on the first report. What has no path at all is the *quiet*
// report: a single 內容有誤 sits in `atlas_reports` until somebody happens to
// open the admin queue, which is not "timely" by any reading of App Store 1.2.
//
// A webhook rather than email: it needs no provider, no dependency and no sender
// domain — one env var and one fetch. Unset means silence, which is the right
// behaviour for local dev and preview.

const TIMEOUT_MS = 2_500;

/**
 * Post a line to the moderation channel. Never throws and never rejects: a
 * notification is an aside, and a moderation report that failed because Slack
 * was down would be a worse bug than the one this exists to catch.
 *
 * Sends `text` *and* `content` in one body so the same URL works for Slack
 * (reads `text`) or Discord (reads `content`) with no configuration.
 */
export async function notifyModeration(message: string): Promise<void> {
  const url = process.env.MODERATION_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, content: message }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error(
      "[notify] moderation webhook failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** Absolute link into the admin queue, so the message is actionable. */
export function adminReportsUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return `${base}/admin/atlas/reports`;
}
