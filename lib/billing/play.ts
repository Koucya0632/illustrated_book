// Google Play Developer API — the Android side of lib/billing/verifier.ts.
//
// Apple hands the client a signed transaction we can check offline; Google
// hands it an opaque purchaseToken that means nothing until we ask Google about
// it. So every Play purchase is verified by a server-to-server call, with a
// service account that Play Console has granted "view financial data" and
// "manage orders".
//
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  the service account key, as JSON
//   GOOGLE_PLAY_PACKAGE_NAME          optional; defaults to app.tuji.android
//
// No google-auth-library: the one thing it would do here is sign a JWT, which
// node:crypto does in four lines.

import { createSign } from "node:crypto";
import { z } from "zod";

export const PLAY_PACKAGE_DEFAULT = "app.tuji.android";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

/** Missing or unusable credentials: a server misconfiguration, never the client's fault. */
export class PlayConfigurationError extends Error {}

/** Google answered, and the answer was not a usable purchase (404, 410, a bad token). */
export class PlayPurchaseNotFound extends Error {}

const serviceAccount = z.object({
  client_email: z.string().email(),
  private_key: z.string().min(1),
  token_uri: z.string().url().default("https://oauth2.googleapis.com/token"),
});
type ServiceAccount = z.infer<typeof serviceAccount>;

/** purchases.products.get — only the fields we read. Millis arrive as strings. */
const productPurchase = z.object({
  purchaseTimeMillis: z.string().regex(/^[0-9]{1,16}$/),
  /** 0 purchased, 1 canceled, 2 pending. */
  purchaseState: z.number().int(),
  /** 0 yet to be consumed, 1 consumed. */
  consumptionState: z.number().int().optional(),
  /** 0 yet to be acknowledged, 1 acknowledged. */
  acknowledgementState: z.number().int().optional(),
  orderId: z.string().optional(),
  /** Absent for a real purchase; 0 = a license tester's test purchase. */
  purchaseType: z.number().int().optional(),
  quantity: z.number().int().optional(),
  obfuscatedExternalAccountId: z.string().optional(),
}).passthrough();
export type ProductPurchase = z.infer<typeof productPurchase>;

const voidedPage = z.object({
  voidedPurchases: z.array(z.object({
    purchaseToken: z.string(),
    orderId: z.string().optional(),
    voidedTimeMillis: z.string().regex(/^[0-9]{1,16}$/),
    // `kind` is the resource name ("androidpublisher#voidedPurchase"), not the
    // product type: one-time products only is what `type=0` in the query asks.
  }).passthrough()).optional(),
  tokenPagination: z.object({ nextPageToken: z.string().optional() }).optional(),
});
export interface VoidedPurchase { purchaseToken: string; orderId: string | null; voidedAt: Date }

export interface PlayApi {
  packageName: string;
  getProductPurchase(productId: string, token: string): Promise<ProductPurchase>;
  acknowledgeProductPurchase(productId: string, token: string): Promise<void>;
  consumeProductPurchase(productId: string, token: string): Promise<void>;
  /** One-time product refunds/chargebacks voided since [since] (Google keeps 30 days). */
  listVoidedPurchases(since: Date): Promise<VoidedPurchase[]>;
}

type Fetch = typeof fetch;

export function createPlayApi(input: {
  credentials: string | undefined;
  packageName?: string;
  fetchImpl?: Fetch;
  clock?: () => number;
}): PlayApi {
  const fetchImpl = input.fetchImpl ?? fetch;
  const clock = input.clock ?? Date.now;
  const packageName = input.packageName || PLAY_PACKAGE_DEFAULT;
  let account: ServiceAccount | null = null;
  let cached: { token: string; expiresAt: number } | null = null;

  function loadAccount(): ServiceAccount {
    if (account) return account;
    if (!input.credentials) throw new PlayConfigurationError("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set");
    let raw: unknown;
    try { raw = JSON.parse(input.credentials); } catch { throw new PlayConfigurationError("service account JSON is malformed"); }
    const parsed = serviceAccount.safeParse(raw);
    if (!parsed.success) throw new PlayConfigurationError("service account JSON lacks client_email/private_key");
    account = parsed.data;
    return account;
  }

  async function accessToken(): Promise<string> {
    const now = clock();
    if (cached && cached.expiresAt - 60_000 > now) return cached.token;
    const sa = loadAccount();
    const iat = Math.floor(now / 1000);
    const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri, iat, exp: iat + 3600 })}`;
    let signature: string;
    try { signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url"); }
    catch { throw new PlayConfigurationError("service account private_key cannot sign"); }
    const res = await fetchImpl(sa.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    });
    if (!res.ok) throw new PlayConfigurationError(`token exchange failed: ${res.status}`);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new PlayConfigurationError("token exchange returned no access_token");
    cached = { token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000 };
    return cached.token;
  }

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetchImpl(`${API}/${encodeURIComponent(packageName)}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await accessToken()}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
    // 401/403: the service account is not (yet) granted in Play Console.
    if (res.status === 401 || res.status === 403) throw new PlayConfigurationError(`Play API refused the service account: ${res.status}`);
    return res;
  }

  const productPath = (productId: string, token: string) =>
    `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;

  return {
    packageName,
    async getProductPurchase(productId, token) {
      const res = await call(productPath(productId, token));
      if (res.status === 400 || res.status === 404 || res.status === 410) throw new PlayPurchaseNotFound(`purchase not found: ${res.status}`);
      if (!res.ok) throw new Error(`Play API purchases.products.get failed: ${res.status}`);
      const parsed = productPurchase.safeParse(await res.json());
      if (!parsed.success) throw new PlayPurchaseNotFound("unexpected purchase shape");
      return parsed.data;
    },
    async acknowledgeProductPurchase(productId, token) {
      const res = await call(`${productPath(productId, token)}:acknowledge`, { method: "POST", body: "{}" });
      if (!res.ok) throw new Error(`Play API acknowledge failed: ${res.status}`);
    },
    async consumeProductPurchase(productId, token) {
      const res = await call(`${productPath(productId, token)}:consume`, { method: "POST" });
      if (!res.ok) throw new Error(`Play API consume failed: ${res.status}`);
    },
    async listVoidedPurchases(since) {
      const out: VoidedPurchase[] = [];
      let pageToken: string | undefined;
      // Bounded: 30 days of refunds for a one-person app is far below 20 pages.
      for (let page = 0; page < 20; page++) {
        const q = new URLSearchParams({ startTime: String(since.getTime()), type: "0", maxResults: "1000" });
        if (pageToken) q.set("token", pageToken);
        const res = await call(`/purchases/voidedpurchases?${q}`);
        if (!res.ok) throw new Error(`Play API voidedpurchases.list failed: ${res.status}`);
        const parsed = voidedPage.parse(await res.json());
        for (const v of parsed.voidedPurchases ?? []) {
          out.push({ purchaseToken: v.purchaseToken, orderId: v.orderId ?? null, voidedAt: new Date(Number(v.voidedTimeMillis)) });
        }
        pageToken = parsed.tokenPagination?.nextPageToken;
        if (!pageToken) break;
      }
      return out;
    },
  };
}

let shared: PlayApi | null = null;
export function serverPlayApi(): PlayApi {
  shared ??= createPlayApi({
    credentials: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON,
    packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME,
  });
  return shared;
}
