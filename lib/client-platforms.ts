// The apps that write platform-tagged rows: feedback, study_reports, events.
//
// One list, because there used to be five. The feedback table's CHECK was
// widened for Android, and the route in front of it kept its own two-value
// Set — so every Android 意見回饋 was a 400 while the migration's comment said
// the fix was in. tests/client-platforms.test.ts holds the routes, the admin
// filters and the database constraints to this list.

export const CLIENT_PLATFORMS = ["web", "ios", "android"] as const;

export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<ClientPlatform, string> = {
  web: "網頁",
  ios: "iOS",
  android: "Android",
};

export function isClientPlatform(value: unknown): value is ClientPlatform {
  return typeof value === "string" && (CLIENT_PLATFORMS as readonly string[]).includes(value);
}
