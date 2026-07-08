// App Store signed-data verification (StoreKit 2). Verifies Apple's JWS
// signatures with the official @apple/app-store-server-library before decoding,
// so a forged transaction can't grant Pro.
//
// Environment (Sandbox vs Production) is read from each signed payload and
// matched to a per-environment verifier. Apple's SignedDataVerifier rejects a
// payload whose environment differs from its own (INVALID_ENVIRONMENT), so a
// single hardcoded environment would break either TestFlight/App Review
// (Sandbox) or real purchases (Production). Picking the verifier by the payload's
// declared environment lets both work against the same backend — safe because
// the signature is still checked against Apple's root, so a forged or mislabelled
// payload can't pass.
//
// Fails CLOSED: if no verifier can be built (missing root certs / bundleId, or a
// Production payload with no APPSTORE_APP_APPLE_ID) it throws, unless
// APPSTORE_ALLOW_UNVERIFIED=true — an explicit, dangerous opt-in that falls back
// to decode-only for sandbox/dev.
//
// Config:
//   APPSTORE_BUNDLE_ID        app bundle id (required to verify)
//   APPSTORE_APP_APPLE_ID     numeric App Store id (required to verify
//                             Production payloads; omit for Sandbox-only)
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

// One verifier per environment, built lazily. A cached `null` means "can't build
// for this environment" (missing config) so we don't repeat the FS/env reads.
const verifiers = new Map<Environment, SignedDataVerifier | null>();

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

/** Map Apple's `environment` string to the library enum (unknown => Sandbox). */
function environmentFor(name: string | undefined): Environment {
  return name === "Production" ? Environment.PRODUCTION : Environment.SANDBOX;
}

/** Build a verifier for one environment. null = not configured for it. */
function buildVerifier(environment: Environment): SignedDataVerifier | null {
  const bundleId = process.env.APPSTORE_BUNDLE_ID;
  const certs = loadRootCertificates();
  if (!bundleId || certs.length === 0) return null;
  const appAppleId = process.env.APPSTORE_APP_APPLE_ID
    ? Number(process.env.APPSTORE_APP_APPLE_ID)
    : undefined;
  // SignedDataVerifier requires the numeric app id for Production and throws
  // without it; treat that as "not configured" for the Production path rather
  // than letting the constructor blow up (Sandbox doesn't need it).
  if (environment === Environment.PRODUCTION && !appAppleId) return null;
  const onlineChecks = process.env.APPSTORE_ONLINE_CHECKS !== "false";
  return new SignedDataVerifier(certs, onlineChecks, environment, bundleId, appAppleId);
}

function getVerifier(environment: Environment): SignedDataVerifier | null {
  if (!verifiers.has(environment)) verifiers.set(environment, buildVerifier(environment));
  return verifiers.get(environment) ?? null;
}

function allowUnverified(): boolean {
  return process.env.APPSTORE_ALLOW_UNVERIFIED === "true";
}

export async function verifyTransaction(signed: string): Promise<AppleTransaction> {
  // Decode (unverified) only to pick the matching environment; the verifier
  // below still checks the signature against Apple's root.
  const decoded = decodeTransaction(signed);
  const verifier = getVerifier(environmentFor(decoded.environment));
  if (verifier) {
    return (await verifier.verifyAndDecodeTransaction(signed)) as unknown as AppleTransaction;
  }
  if (allowUnverified()) {
    console.warn("[billing] APPSTORE_ALLOW_UNVERIFIED: decoding transaction WITHOUT signature verification");
    return decoded;
  }
  throw new BillingVerificationError("App Store verification not configured");
}

export async function verifyNotification(signed: string): Promise<AppleNotification> {
  const decoded = decodeNotification(signed);
  const verifier = getVerifier(environmentFor(decoded.data?.environment));
  if (verifier) {
    return (await verifier.verifyAndDecodeNotification(signed)) as unknown as AppleNotification;
  }
  if (allowUnverified()) {
    console.warn("[billing] APPSTORE_ALLOW_UNVERIFIED: decoding notification WITHOUT signature verification");
    return decoded;
  }
  throw new BillingVerificationError("App Store verification not configured");
}
