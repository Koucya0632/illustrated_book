// User-level auth: PBKDF2 password hashing + signed session cookie.
//
// Uses Web Crypto only, so it runs in both Edge (middleware, edge routes)
// and Node runtimes.
//
// Cookie format: `<userId>.<expiryMs>.<hmac>` where the HMAC is taken over
// `<userId>.<expiryMs>` using a key derived from ADMIN_PASSWORD (so that
// rotating ADMIN_PASSWORD invalidates all sessions — including the admin one).

const ENC = new TextEncoder();

export const USER_COOKIE = "eepd_user";
const USER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PBKDF2_ITER = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- password hashing ----

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await crypto.subtle.importKey(
    "raw",
    ENC.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITER, hash: "SHA-256" },
    key,
    HASH_BYTES * 8,
  );
  return `pbkdf2$${PBKDF2_ITER}$${b64url(salt)}$${b64url(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iter = Number(parts[1]);
  if (!Number.isFinite(iter) || iter < 1000) return false;
  const salt = fromB64url(parts[2]);
  const expected = fromB64url(parts[3]);

  const key = await crypto.subtle.importKey(
    "raw",
    ENC.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt as BufferSource, iterations: iter, hash: "SHA-256" },
      key,
      expected.length * 8,
    ),
  );

  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}

// ---- session token (HMAC-signed cookie) ----

async function sessionKey(): Promise<CryptoKey> {
  const base = process.env.ADMIN_PASSWORD;
  if (!base) throw new Error("ADMIN_PASSWORD not configured");
  // Namespace from admin key so admin/user signatures aren't interchangeable.
  const baseKey = await crypto.subtle.importKey(
    "raw",
    ENC.encode(base),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derived = await crypto.subtle.sign(
    "HMAC",
    baseKey,
    ENC.encode("eepd-user-session/v1"),
  );
  return crypto.subtle.importKey(
    "raw",
    derived,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function mintUserToken(userId: number): Promise<string> {
  const expiry = Date.now() + USER_TTL_MS;
  const payload = `${userId}.${expiry}`;
  const key = await sessionKey();
  const sig = await crypto.subtle.sign("HMAC", key, ENC.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifyUserToken(token: string | undefined): Promise<number | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts;
  if (!/^\d+$/.test(uid) || !/^\d+$/.test(exp)) return null;
  if (Number(exp) < Date.now()) return null;

  const key = await sessionKey();
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    fromB64url(sig) as BufferSource,
    ENC.encode(`${uid}.${exp}`),
  );
  return ok ? Number(uid) : null;
}

export function userCookieMaxAgeSeconds(): number {
  return Math.floor(USER_TTL_MS / 1000);
}
