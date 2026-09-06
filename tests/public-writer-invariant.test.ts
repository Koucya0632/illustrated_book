import assert from "node:assert/strict";
import test from "node:test";
import { assertWriterConfigured, writeBackend } from "../lib/storage/public-writer";

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const prev = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    process.env = prev;
  }
}

const R2 = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "tuji-assets",
};
const NO_R2 = Object.fromEntries(Object.keys(R2).map((k) => [k, undefined]));
// REST reaches R2 through api.cloudflare.com instead of the S3 endpoint, so it
// needs the account and bucket but an API token rather than an S3 key pair.
const REST_ONLY = {
  ...NO_R2,
  R2_ACCOUNT_ID: "acct",
  R2_BUCKET: "tuji-assets",
  CLOUDFLARE_API_TOKEN: "cf-token",
};

test("without an asset host, objects go to Supabase", () => {
  withEnv({ NEXT_PUBLIC_ASSET_BASE_URL: undefined, ...NO_R2 }, () => {
    assert.equal(writeBackend(), "supabase");
    assert.doesNotThrow(assertWriterConfigured);
  });
});

test("with an asset host and credentials, objects go to R2", () => {
  withEnv({ NEXT_PUBLIC_ASSET_BASE_URL: "https://img.example.com", ...R2 }, () => {
    assert.equal(writeBackend(), "r2");
    assert.doesNotThrow(assertWriterConfigured);
  });
});

// The failure this module exists to prevent: URLs naming the asset host while
// the bytes are still written to Supabase. Every newly uploaded image would
// 404, and only newly uploaded ones — so it would look like a client bug.
test("an asset host without any R2 transport is refused, not silently split", () => {
  withEnv(
    { NEXT_PUBLIC_ASSET_BASE_URL: "https://img.example.com", ...NO_R2, CLOUDFLARE_API_TOKEN: undefined },
    () => {
      assert.equal(writeBackend(), "r2");
      assert.throws(assertWriterConfigured, /no R2 transport is configured/);
    },
  );
});

// The S3 endpoint is currently unusable (Cloudflare-side TLS provisioning), so
// a deploy carrying only REST credentials has to count as configured — else the
// guard against a split would itself block the cutover it exists to protect.
test("REST credentials alone are a complete configuration", () => {
  withEnv({ NEXT_PUBLIC_ASSET_BASE_URL: "https://img.example.com", ...REST_ONLY }, () => {
    assert.equal(writeBackend(), "r2");
    assert.doesNotThrow(assertWriterConfigured);
  });
});
