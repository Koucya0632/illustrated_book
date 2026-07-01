// App Store signed-data verification (StoreKit 2). Verifies Apple's JWS
// signatures with the official @apple/app-store-server-library before decoding,
// so a forged transaction can't grant Pro.
//
// Fails CLOSED: if the verifier isn't configured (no root certs / bundleId) it
// throws, unless APPSTORE_ALLOW_UNVERIFIED=true is set — an explicit, dangerous
// opt-in that falls back to decode-only for sandbox/dev.
//
// Config:
//   APPSTORE_BUNDLE_ID        app bundle id (required to verify)
//   APPSTORE_ENVIRONMENT      Sandbox | Production (default Sandbox)
//   APPSTORE_APP_APPLE_ID     numeric App Store id (required in Production)
//   APPSTORE_ROOT_CERTS       comma-separated base64 DER root certs (preferred)
//   APPSTORE_ROOT_CERTS_DIR   dir of .cer/.der files (local/self-host fallback)
//   APPSTORE_ONLINE_CHECKS    "false" to disable OCSP/expiry checks (default on)
//   APPSTORE_ALLOW_UNVERIFIED "true" to skip verification (sandbox/dev only)

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { Environment, SignedDataVerifier } from "@apple/app-store-server-library";
import {
  decodeNotification,
  decodeTransaction,
  type AppleNotification,
  type AppleTransaction,
} from "./appstore";

export class BillingVerificationError extends Error {}

let cached: SignedDataVerifier | null | undefined;

function loadRootCertificates(): Buffer[] {
  // Preferred (serverless-safe): comma-separated base64 DER certs in env.
  const env = process.env.APPSTORE_ROOT_CERTS;
  if (env) {
    return env
      .split(",")
      .map((b64) => Buffer.from(b64.trim(), "base64"))
      .filter((buf) => buf.length > 0);
  }
  // Fallback: a directory of DER cert files (local / self-hosted).
  const dir = process.env.APPSTORE_ROOT_CERTS_DIR;
  if (!dir) return [];
  try {
    return readdirSync(dir)
      .filter((f) => /\.(cer|der|crt)$/i.test(f))
      .map((f) => readFileSync(join(dir, f)));
  } catch {
    return [];
  }
}

function targetEnvironment(): Environment {
  return process.env.APPSTORE_ENVIRONMENT === "Production"
    ? Environment.PRODUCTION
    : Environment.SANDBOX;
}

/** Build the verifier once. null = not configured (missing certs / bundleId). */
function getVerifier(): SignedDataVerifier | null {
  if (cached !== undefined) return cached;
  const bundleId = process.env.APPSTORE_BUNDLE_ID;
  const certs = loadRootCertificates();
  if (!bundleId || certs.length === 0) {
    cached = null;
    return null;
  }
  const appAppleId = process.env.APPSTORE_APP_APPLE_ID
    ? Number(process.env.APPSTORE_APP_APPLE_ID)
    : undefined;
  const onlineChecks = process.env.APPSTORE_ONLINE_CHECKS !== "false";
  cached = new SignedDataVerifier(certs, onlineChecks, targetEnvironment(), bundleId, appAppleId);
  return cached;
}

function allowUnverified(): boolean {
  return process.env.APPSTORE_ALLOW_UNVERIFIED === "true";
}

export async function verifyTransaction(signed: string): Promise<AppleTransaction> {
  const verifier = getVerifier();
  if (verifier) {
    const decoded = await verifier.verifyAndDecodeTransaction(signed);
    return decoded as unknown as AppleTransaction;
  }
  if (allowUnverified()) {
    console.warn("[billing] APPSTORE_ALLOW_UNVERIFIED: decoding transaction WITHOUT signature verification");
    return decodeTransaction(signed);
  }
  throw new BillingVerificationError("App Store verification not configured");
}

export async function verifyNotification(signed: string): Promise<AppleNotification> {
  const verifier = getVerifier();
  if (verifier) {
    const decoded = await verifier.verifyAndDecodeNotification(signed);
    return decoded as unknown as AppleNotification;
  }
  if (allowUnverified()) {
    console.warn("[billing] APPSTORE_ALLOW_UNVERIFIED: decoding notification WITHOUT signature verification");
    return decodeNotification(signed);
  }
  throw new BillingVerificationError("App Store verification not configured");
}
