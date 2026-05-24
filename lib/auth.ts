// Tiny single-password auth.
//
// On login we set an httpOnly cookie containing `<expiry>.<hmac>`, where the
// HMAC is over `<expiry>` using ADMIN_PASSWORD as the key. We never store the
// password itself in the cookie. Middleware re-verifies the HMAC on every
// admin request.
//
// Uses Web Crypto so it runs in Edge runtime (middleware) and Node alike.

const ENCODER = new TextEncoder();

export const ADMIN_COOKIE = "eepd_admin";
const ADMIN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function hmac(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, ENCODER.encode(data));
  // base64url
  const b = String.fromCharCode(...new Uint8Array(sig));
  return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function mintAdminToken(): Promise<string> {
  const key = process.env.ADMIN_PASSWORD;
  if (!key) throw new Error("ADMIN_PASSWORD not set");
  const expiry = String(Date.now() + ADMIN_TTL_MS);
  const sig = await hmac(key, expiry);
  return `${expiry}.${sig}`;
}

export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const key = process.env.ADMIN_PASSWORD;
  if (!key) return false;
  const [expiry, sig] = token.split(".");
  if (!expiry || !sig) return false;
  if (Number(expiry) < Date.now()) return false;
  const expected = await hmac(key, expiry);
  // constant-time-ish compare
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

export function cookieMaxAgeSeconds(): number {
  return Math.floor(ADMIN_TTL_MS / 1000);
}
