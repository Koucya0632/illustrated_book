// Minimal Google OAuth 2.0 helpers — no external deps.
//
// Flow:
//  1. /api/auth/google      → build authorize URL, set state cookie, 302 redirect
//  2. /api/auth/google/callback ← Google redirects with ?code=&state=
//      - verify cookie state matches query state (CSRF)
//      - exchange code for access_token
//      - fetch userinfo (sub, email, name, picture)
//      - upsert into users table, set our session cookie
//      - redirect to /me (or wherever the start route stashed)

export const STATE_COOKIE = "eepd_oauth_state";
export const NEXT_COOKIE = "eepd_oauth_next";
export const STATE_TTL_SEC = 600; // 10 min — user has to finish the round trip

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return {
    clientId,
    clientSecret,
    enabled: Boolean(clientId && clientSecret),
  };
}

export function buildAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{ access_token: string; id_token?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`token exchange failed: ${res.status} ${txt}`);
  }
  return res.json();
}

export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`userinfo failed: ${res.status} ${txt}`);
  }
  return res.json();
}

// Build the redirect URI from the incoming request. Must match what's
// registered in the Google Cloud Console exactly.
export function redirectUriFromRequest(req: Request): string {
  const url = new URL(req.url);
  return `${url.origin}/api/auth/google/callback`;
}

export function randomState(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
