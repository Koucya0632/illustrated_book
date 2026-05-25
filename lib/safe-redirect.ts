// Reject anything that isn't a same-origin path. A `next=` param coming from
// the URL must never be allowed to send the user off-site after login, or
// phishing pages can chain after a real auth flow.
//
// Allowed:   /me   /word/foo   /admin?x=1
// Rejected:  https://evil.com   //evil.com   javascript:...   (empty)

export function safeNextPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.startsWith("/\\")) return fallback;
  return next;
}
