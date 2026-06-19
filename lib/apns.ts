// Token-based Apple Push Notification service (APNs) client.
//
// No third-party dependency: we sign the ES256 provider JWT with Node's
// built-in `crypto` and talk HTTP/2 to Apple via `node:http2`. This only
// runs in the Node.js runtime (the cron route sets `runtime = "nodejs"`).
//
// Required env (see docs/push-reminders.md):
//   APNS_KEY_ID       — the 10-char Key ID of the .p8 auth key
//   APNS_TEAM_ID      — your 10-char Apple Developer Team ID
//   APNS_PRIVATE_KEY  — full PEM contents of the .p8 file
//                       (literal "\n" escapes are also accepted)
//   APNS_BUNDLE_ID    — app bundle id, used as the `apns-topic` header
//                       (default: app.tuji.ios)
//   APNS_PRODUCTION   — "true" → api.push.apple.com (default),
//                       "false" → api.sandbox.push.apple.com
//
// Apple requires the provider token be refreshed at least every 60 min and
// reused for at least 20 min, so we cache the signed JWT for ~50 minutes.

import crypto from "node:crypto";
import http2 from "node:http2";

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  production: boolean;
}

export type ApnsResult =
  | { ok: true; token: string }
  | { ok: false; token: string; status: number; reason: string; dead: boolean };

/** Reads + validates APNs env. Returns null when not configured. */
export function apnsConfigFromEnv(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  let privateKey = process.env.APNS_PRIVATE_KEY;
  if (!keyId || !teamId || !privateKey) return null;
  // Vercel/env editors often store the PEM with escaped newlines.
  if (privateKey.includes("\\n")) privateKey = privateKey.replace(/\\n/g, "\n");
  return {
    keyId,
    teamId,
    privateKey,
    bundleId: process.env.APNS_BUNDLE_ID ?? "app.tuji.ios",
    production: process.env.APNS_PRODUCTION !== "false",
  };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

let cachedJwt: { token: string; issuedAt: number; keyId: string } | null = null;

/** Signs (or returns a cached) ES256 provider token for APNs. */
function providerToken(cfg: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (
    cachedJwt &&
    cachedJwt.keyId === cfg.keyId &&
    now - cachedJwt.issuedAt < 50 * 60
  ) {
    return cachedJwt.token;
  }

  const header = base64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const payload = base64url(JSON.stringify({ iss: cfg.teamId, iat: now }));
  const signingInput = `${header}.${payload}`;

  // APNs wants the raw (r||s) ECDSA signature, which is exactly what the
  // "ieee-p1363" DSA encoding produces — no DER-to-JOSE conversion needed.
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: cfg.privateKey,
    dsaEncoding: "ieee-p1363",
  });

  const token = `${signingInput}.${base64url(signature)}`;
  cachedJwt = { token, issuedAt: now, keyId: cfg.keyId };
  return token;
}

export interface ApnsAlert {
  title: string;
  body: string;
  /** Optional payload merged into `aps` (sound, badge, etc.). */
  sound?: string;
}

/**
 * Sends one alert notification to a single device token. Resolves with a
 * structured result rather than throwing, so the caller can fan out and
 * collect dead tokens. `dead` is true for tokens APNs says are permanently
 * invalid (410 Unregistered / 400 BadDeviceToken) — the caller should delete
 * those rows.
 */
export function sendApns(
  cfg: ApnsConfig,
  deviceToken: string,
  alert: ApnsAlert,
): Promise<ApnsResult> {
  const host = cfg.production
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";

  const body = JSON.stringify({
    aps: {
      alert: { title: alert.title, body: alert.body },
      sound: alert.sound ?? "default",
    },
  });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: ApnsResult) => {
      if (settled) return;
      settled = true;
      try {
        client.close();
      } catch {
        /* ignore */
      }
      resolve(r);
    };

    let client: http2.ClientHttp2Session;
    try {
      client = http2.connect(host);
    } catch (err) {
      resolve({
        ok: false,
        token: deviceToken,
        status: 0,
        reason: `connect_failed:${String(err)}`,
        dead: false,
      });
      return;
    }

    client.on("error", (err) =>
      finish({
        ok: false,
        token: deviceToken,
        status: 0,
        reason: `session_error:${err.message}`,
        dead: false,
      }),
    );

    let jwt: string;
    try {
      jwt = providerToken(cfg);
    } catch (err) {
      finish({
        ok: false,
        token: deviceToken,
        status: 0,
        reason: `jwt_sign_failed:${String(err)}`,
        dead: false,
      });
      return;
    }

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": cfg.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });

    let status = 0;
    let data = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (status === 200) {
        finish({ ok: true, token: deviceToken });
        return;
      }
      let reason = "unknown";
      try {
        reason = (JSON.parse(data) as { reason?: string }).reason ?? reason;
      } catch {
        /* non-JSON error body */
      }
      const dead =
        status === 410 ||
        reason === "Unregistered" ||
        reason === "BadDeviceToken" ||
        reason === "DeviceTokenNotForTopic";
      finish({ ok: false, token: deviceToken, status, reason, dead });
    });
    req.on("error", (err) =>
      finish({
        ok: false,
        token: deviceToken,
        status: 0,
        reason: `request_error:${err.message}`,
        dead: false,
      }),
    );

    req.end(body);
  });
}
